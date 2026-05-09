// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IWalletStateAttestation.sol";

/// @notice Single machine-readable access requirement, per ERC-8257.
struct AccessRequirement {
    bytes4 kind;
    bytes data;
    string label;
}

/// @notice Boolean logic combining multiple requirements, per ERC-8257.
enum RequirementLogic { AND, OR }

/// @title IAccessPredicate
/// @notice Three-function predicate interface for ERC-8257 tool gating.
/// @dev Inlined here for the example. Downstream consumers should import
///      from the ERC-8257 reference implementation
///      (`github.com/ProjectOpenSea/tool-registry`) once the spec settles.
interface IAccessPredicate {
    function hasAccess(
        uint256 toolId,
        address account,
        bytes calldata data
    ) external view returns (bool);

    function name() external view returns (string memory);

    function getRequirements(uint256 toolId)
        external
        view
        returns (AccessRequirement[] memory requirements, RequirementLogic logic);
}

/// @notice Minimal ERC-165 interface (inlined to keep the example single-file).
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @title InsumerAccessPredicate
/// @notice Reference `IAccessPredicate` (ERC-8257) for off-chain-signed
///         wallet-state attestations issued by InsumerAPI.
///
/// @dev Architecture
///      ----------------------------------------------------------------
///      InsumerAPI signs an attestation off-chain using ECDSA P-256
///      (ES256). The signed payload is the JSON object:
///        `{ id, pass, results[], attestedAt }`
///      hashed with SHA-256 and signed under a key whose public
///      coordinates are published at:
///        https://api.insumermodel.com/.well-known/jwks.json
///        kid: "insumer-attest-v1", crv: P-256, alg: ES256
///
///      The predicate verifies the signature on-chain via the RIP-7212
///      `P256VERIFY` precompile (`0x0100`). The condition set is bound
///      to a specific operator-defined policy through
///      `expectedConditionHash`, set immutably at construction.
///
///      One predicate deployment per `(issuer key, condition set)` tuple.
///      For multi-condition sets, deploy multiple predicates and combine
///      via the ERC-8257 `CompositePredicate` example with AND/OR logic.
///
/// @dev Why this shape rather than direct on-chain reads
///      ----------------------------------------------------------------
///      Predicates that read on-chain holdings (ERC-721, ERC-1155,
///      subscription) are restricted to state on the same EVM chain as
///      the registry. Wallet state on non-EVM chains (Solana, XRPL,
///      Bitcoin) cannot be evaluated from a Solidity predicate. The
///      off-chain issuer evaluates the condition set against the
///      relevant chain data, signs a verdict, and the on-chain
///      predicate verifies the signature.
///
/// @dev Distinct from the AccessProof pattern in §"Account Parameter Is
///      Advisory". That pattern is requester-self-signed: the wallet
///      signs a challenge tying it to `account`. This pattern is
///      issuer-signed: an external attestation service signs a verdict
///      about `account`'s wallet state. Identity-binding (AccessProof)
///      and state-binding (this predicate) are orthogonal concerns; a
///      complete access scheme MAY want both.
///
/// @dev Gas budget
///      ----------------------------------------------------------------
///      `P256VERIFY` precompile: ~3,450 gas. ABI decode of the seven-tuple
///      payload + bookkeeping: ~3-5,000 gas. Total well under the
///      ERC-8257 `staticcall` cap of 200,000 gas.
///
/// @dev GETTING CREDENTIALS
///      ----------------------------------------------------------------
///      Free tier — no credit card. 100 daily reads + 10 attestation credits.
///
///      Developers (email-based):
///        POST https://api.insumermodel.com/v1/keys/create
///        body: {"email":"YOUR_EMAIL","appName":"erc8257-predicate","tier":"free"}
///
///      Agents (wallet-based, no email):
///        POST https://api.insumermodel.com/v1/keys/buy
///        body: {"txHash":"0x...","chainId":8453,"amount":5,"appName":"my-agent"}
///        Agent sends USDC/USDT/BTC to the platform wallet, then POSTs the tx
///        hash — sending wallet is the identity. Stablecoin auto-detected from
///        the transfer log. Minimum 5 stablecoin units; credits scale with
///        amount.
///
///      Once the key is provisioned, fetch a signed attestation:
///        POST https://api.insumermodel.com/v1/attest
///        headers: {"X-API-Key": "<your_key>"}
///        body: {"wallet": "0x...", "conditions": [{"type":"token_balance",
///               "contractAddress":"0x...", "chainId": 1, "threshold": 1,
///               "decimals": 6, "label": "USDC >= 1 on Ethereum"}]}
///
///      Decode the response into the seven-tuple `data` payload (see
///      IWalletStateAttestation.sol for the layout) and pass it to
///      `IToolRegistry.hasAccess(toolId, account, data)`.
///
///      API reference:        https://insumermodel.com/developers/api-reference/
///      JWKS:                 https://api.insumermodel.com/.well-known/jwks.json
///      Verification library: npm install insumer-verify
///
/// @custom:audit status=unaudited
contract InsumerAccessPredicate is IAccessPredicate, IERC165 {
    // ─────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────

    /// @dev RIP-7212 P256VERIFY precompile address.
    address constant P256_VERIFIER = address(0x0100);

    /// @dev Maximum block age for a fresh attestation.
    ///      ~30 minutes on a 2-second-block L2 (matches the API's
    ///      `expiresAt` TTL of 30 minutes).
    uint256 public constant MAX_BLOCK_AGE = 900;

    // ─────────────────────────────────────────────
    // Immutable configuration
    // ─────────────────────────────────────────────

    /// @dev InsumerAPI ECDSA P-256 public-key X coordinate.
    ///      Source: https://api.insumermodel.com/.well-known/jwks.json
    uint256 public immutable pubKeyX;

    /// @dev InsumerAPI ECDSA P-256 public-key Y coordinate.
    uint256 public immutable pubKeyY;

    /// @dev Hash of the canonical condition set this predicate enforces.
    ///      Pinned at construction: one predicate gates one condition set.
    bytes32 public immutable expectedConditionHash;

    /// @dev URI advertised in `getRequirements` so agents can locate the
    ///      issuer's public-key set.
    string public issuerJWKSURI;

    // ─────────────────────────────────────────────
    // Construction
    // ─────────────────────────────────────────────

    /// @param _pubKeyX                X coordinate of the InsumerAPI P-256 key.
    /// @param _pubKeyY                Y coordinate of the InsumerAPI P-256 key.
    /// @param _expectedConditionHash  `keccak256(abi.encodePacked(conditionHashHex))`
    ///                                where `conditionHashHex` is
    ///                                `results[0].conditionHash` from the API
    ///                                (SHA-256 hex, `0x`-prefixed).
    /// @param _issuerJWKSURI          HTTPS URL to the issuer's JWKS document.
    constructor(
        uint256 _pubKeyX,
        uint256 _pubKeyY,
        bytes32 _expectedConditionHash,
        string memory _issuerJWKSURI
    ) {
        pubKeyX = _pubKeyX;
        pubKeyY = _pubKeyY;
        expectedConditionHash = _expectedConditionHash;
        issuerJWKSURI = _issuerJWKSURI;
    }

    // ─────────────────────────────────────────────
    // IAccessPredicate
    // ─────────────────────────────────────────────

    /// @inheritdoc IAccessPredicate
    /// @dev Returns `false` on any verification failure rather than
    ///      reverting, so `IToolRegistry.tryHasAccess` distinguishes a
    ///      clean denial `(true, false)` from a predicate malfunction
    ///      `(false, false)` per ERC-8257 §"Predicate Reverting".
    ///
    ///      The `account` argument is bound to the attestation via
    ///      `wallet == account`. ERC-8257 §"Account Parameter Is
    ///      Advisory" still applies: the registry does not authenticate
    ///      `msg.sender == account`, and downstream enforcers MUST bind
    ///      `account` to the real principal independently.
    ///
    /// @param account  Address being checked against the attestation.
    /// @param data     `abi.encode(bool pass, address wallet,`
    ///                 `bytes32 conditionHash, uint256 blockNumber,`
    ///                 `bytes32 r, bytes32 s, bytes32 messageHash)`
    function hasAccess(
        uint256 /* toolId */,
        address account,
        bytes calldata data
    ) external view override returns (bool) {
        if (data.length == 0) return false;

        (
            bool pass,
            address wallet,
            bytes32 conditionHash,
            uint256 blockNumber,
            bytes32 r,
            bytes32 s,
            bytes32 messageHash
        ) = abi.decode(
            data,
            (bool, address, bytes32, uint256, bytes32, bytes32, bytes32)
        );

        if (!pass) return false;
        if (wallet != account) return false;
        if (conditionHash != expectedConditionHash) return false;
        if (blockNumber > block.number) return false;
        if (block.number - blockNumber > MAX_BLOCK_AGE) return false;

        return _verifyP256(messageHash, r, s);
    }

    /// @inheritdoc IAccessPredicate
    function name() external pure override returns (string memory) {
        return "InsumerAccessPredicate";
    }

    /// @inheritdoc IAccessPredicate
    function getRequirements(uint256 /* toolId */)
        external
        view
        override
        returns (AccessRequirement[] memory requirements, RequirementLogic logic)
    {
        requirements = new AccessRequirement[](1);
        requirements[0] = AccessRequirement({
            kind: type(IWalletStateAttestation).interfaceId,
            data: abi.encode(issuerJWKSURI, expectedConditionHash),
            label: "InsumerAPI signed wallet-state attestation"
        });
        logic = RequirementLogic.AND;
    }

    // ─────────────────────────────────────────────
    // IERC165
    // ─────────────────────────────────────────────

    /// @inheritdoc IERC165
    /// @dev MUST advertise both `IERC165` and `IAccessPredicate` so that
    ///      registration validation per ERC-8257 §"Predicate Validation
    ///      at Registration" accepts the predicate.
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IAccessPredicate).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    // ─────────────────────────────────────────────
    // Internal: P-256 signature verification
    // ─────────────────────────────────────────────

    /// @dev Verify an ECDSA P-256 signature using the RIP-7212 precompile.
    ///      Input layout: `messageHash || r || s || x || y` (5 × 32 bytes).
    ///      Returns `true` iff the precompile returned `1`.
    function _verifyP256(bytes32 messageHash, bytes32 r, bytes32 s) internal view returns (bool) {
        (bool success, bytes memory result) = P256_VERIFIER.staticcall(
            abi.encodePacked(messageHash, r, s, pubKeyX, pubKeyY)
        );
        return success && result.length == 32 && abi.decode(result, (uint256)) == 1;
    }
}
