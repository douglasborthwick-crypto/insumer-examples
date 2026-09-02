// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IWalletStateVerifier
/// @notice Minimal interface inlined from erc-8183/hook-contracts
///         (contracts/hooks/WalletStateHook.sol). Hooks read this surface to
///         answer "does this wallet satisfy the named condition set right now?"
interface IWalletStateVerifier {
    function checkWalletState(address wallet, bytes32 conditionsHash)
        external
        view
        returns (bool verified, uint256 validUntil);
}

/// @title InsumerWalletStateVerifier
/// @notice Reference IWalletStateVerifier implementation that exposes off-chain
///         InsumerAPI wallet-state attestations for ERC-8183 hooks.
///
/// @dev DEFAULT MODE — anchored P-256 verification (recommended)
///      ----------------------------------------------------------------
///      Construct with the InsumerAPI service public key (`pubKeyX`, `pubKeyY`).
///      Every `submitAttestation()` call must carry the off-chain ECDSA P-256
///      signature components; the contract verifies them on-chain via the
///      RIP-7212 P256VERIFY precompile before storing the result. The trust
///      anchor is the immutable signing key — the relayer is untrusted.
///
///      This is the canonical configuration. The contract is a verifier, not a
///      registry: trust derives from the off-chain signature, not from the
///      stored value. The cache exists only to amortise gas across reads with
///      the same `(wallet, conditionsHash)` inside `validUntil`.
///
///      JWKS for the signing key: https://api.insumermodel.com/v1/jwks
///      RIP-7212 availability: Base, Optimism, Arbitrum, Polygon, Scroll,
///      ZKsync, Celo — matches the typical ERC-8183 deployment footprint.
///
///      Post-quantum companion:
///      Since 2026-09-01 every attest and trust response also carries an ML-DSA-65
///      post-quantum companion (pqSig/pqKid on the raw response, pqJwt beside jwt),
///      and the JWKS carries two RFC 9964 AKP entries for its key (kids
///      insumer-attest-pq1/insumer-trust-pq1) after the three EC entries. This
///      contract verifies the classical ES256 signature only and does not consume
///      the companion.
///
/// @dev FALLBACK MODE — trusted relayer (testnet-only)
///      ----------------------------------------------------------------
///      Constructing with `pubKeyX = pubKeyY = 0` skips on-chain signature
///      verification and trusts the relayer to push honest results. This is a
///      testnet / local-development convenience and is on a deprecation track.
///      Do NOT use in production: it removes the cryptographic anchor and
///      collapses the trust model to "we trust the relayer," which is oracle-
///      shaped, not verifier-shaped.
///
/// @dev INTEGRATION FLOW (anchored mode)
///      1. Off-chain: caller obtains a signed attestation for `(wallet, conditions)`
///         from `POST https://api.insumermodel.com/v1/attest`. Response includes
///         per-condition results plus an ECDSA P-256 (ES256) signature over the
///         payload, plus a `conditionsHash` derived from the condition set.
///      2. A relayer calls `submitAttestation(wallet, conditionsHash, verified,
///         validUntil, r, s, messageHash)`. The contract verifies the signature
///         via RIP-7212 against the immutable `pubKeyX`/`pubKeyY` and stores the
///         result.
///      3. `WalletStateHook` (or any other consumer) reads `checkWalletState()`
///         to gate job-lifecycle actions.
///
/// @dev GETTING CREDENTIALS
///      Free tier — no credit card. 100 daily reads + 10 attestation credits.
///
///      Developers (email-based):
///        POST https://api.insumermodel.com/v1/keys/create
///        body: {"email":"YOUR_EMAIL","appName":"erc8183-hooks","tier":"free"}
///
///      Agents (wallet-based, no email):
///        POST https://api.insumermodel.com/v1/keys/buy
///        body: {"txHash":"0x...","chainId":8453,"amount":5,"appName":"my-agent"}
///        Agent sends USDC/USDT/BTC to the platform wallet, then POSTs the tx
///        hash — sending wallet is the identity. Stablecoin auto-detected from
///        the transfer log. Minimum 5 stablecoin units; credits scale with amount.
///
///      API reference: https://insumermodel.com/developers/api-reference/
///      Attestation:   POST https://api.insumermodel.com/v1/attest
///      JWKS:          https://api.insumermodel.com/v1/jwks
/// @custom:audit status=unaudited
contract InsumerWalletStateVerifier is IWalletStateVerifier {
    struct Attestation {
        bool verified;
        uint256 validUntil;
    }

    error NotRelayer();
    error NotOwner();
    error ZeroAddress();
    error InvalidSignature();

    event AttestationSubmitted(
        address indexed wallet,
        bytes32 indexed conditionsHash,
        bool verified,
        uint256 validUntil
    );
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);

    /// @dev RIP-7212 P256VERIFY precompile address
    address constant P256_VERIFIER = address(0x0100);

    /// @dev InsumerAPI service P-256 public key coordinates.
    ///      Set to non-zero for anchored mode (recommended).
    ///      Set to (0, 0) for trusted-relayer fallback (testnet-only).
    uint256 public immutable pubKeyX;
    uint256 public immutable pubKeyY;

    /// @dev Whether on-chain signature verification is enabled.
    ///      True iff `pubKeyX != 0 && pubKeyY != 0` (anchored mode).
    bool public immutable verifySignatures;

    /// @dev Authorized relayer address
    address public relayer;

    /// @dev Contract owner (can update relayer)
    address public owner;

    /// @dev Stored attestations keyed by (wallet, conditionsHash)
    mapping(address => mapping(bytes32 => Attestation)) private _attestations;

    /// @param _relayer  Authorized relayer address
    /// @param _pubKeyX  X coordinate of attestation service public key (0 to skip verification)
    /// @param _pubKeyY  Y coordinate of attestation service public key (0 to skip verification)
    constructor(address _relayer, uint256 _pubKeyX, uint256 _pubKeyY) {
        if (_relayer == address(0)) revert ZeroAddress();
        relayer = _relayer;
        owner = msg.sender;
        pubKeyX = _pubKeyX;
        pubKeyY = _pubKeyY;
        verifySignatures = _pubKeyX != 0 && _pubKeyY != 0;
    }

    /// @inheritdoc IWalletStateVerifier
    function checkWalletState(address wallet, bytes32 conditionsHash)
        external
        view
        override
        returns (bool verified, uint256 validUntil)
    {
        Attestation memory a = _attestations[wallet][conditionsHash];
        return (a.verified, a.validUntil);
    }

    /// @notice Push an attestation result on-chain.
    /// @param wallet The wallet the attestation refers to.
    /// @param conditionsHash Hash identifying the condition set evaluated.
    /// @param verified Whether the wallet passed all conditions in the set.
    /// @param validUntil Unix timestamp when the attestation expires.
    /// @param r P-256 signature r component (ignored if !verifySignatures)
    /// @param s P-256 signature s component (ignored if !verifySignatures)
    /// @param messageHash SHA-256 of the signed attestation payload (ignored if !verifySignatures)
    function submitAttestation(
        address wallet,
        bytes32 conditionsHash,
        bool verified,
        uint256 validUntil,
        bytes32 r,
        bytes32 s,
        bytes32 messageHash
    ) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (verifySignatures) {
            if (!_verifyP256(messageHash, r, s)) revert InvalidSignature();
        }
        _attestations[wallet][conditionsHash] = Attestation({
            verified: verified,
            validUntil: validUntil
        });
        emit AttestationSubmitted(wallet, conditionsHash, verified, validUntil);
    }

    /// @notice Update the authorized relayer address.
    function setRelayer(address _relayer) external {
        if (msg.sender != owner) revert NotOwner();
        if (_relayer == address(0)) revert ZeroAddress();
        emit RelayerUpdated(relayer, _relayer);
        relayer = _relayer;
    }

    /// @dev Verify P-256 signature using RIP-7212 precompile.
    ///      Input layout: messageHash || r || s || x || y (5 x 32 bytes).
    ///      Returns true iff the precompile returned 1.
    function _verifyP256(bytes32 messageHash, bytes32 r, bytes32 s) internal view returns (bool) {
        (bool success, bytes memory result) = P256_VERIFIER.staticcall(
            abi.encodePacked(messageHash, r, s, pubKeyX, pubKeyY)
        );
        return success && result.length == 32 && abi.decode(result, (uint256)) == 1;
    }
}
