// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {
    InsumerAccessPredicate,
    IAccessPredicate,
    IERC165,
    AccessRequirement,
    RequirementLogic
} from "./InsumerAccessPredicate.sol";
import {IWalletStateAttestation} from "./IWalletStateAttestation.sol";

/// @title InsumerAccessPredicate fixture-driven test
/// @notice Fixture captured 2026-05-09 19:16 UTC via live POST /v1/attest.
///         Wallet: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 (vitalik.eth)
///         Condition: USDC >= 1 on Ethereum mainnet
///         Signature verified out-of-band against JWKS at
///         https://api.insumermodel.com/.well-known/jwks.json with Node crypto.
contract InsumerAccessPredicateTest is Test {
    // ── JWKS coordinates (insumer-attest-v1, ES256, P-256) ──
    uint256 constant PUB_KEY_X =
        0x26d1cf8433e7bfc01f3f4252946badc5b3a5c6b795d8285ecb6ed9efaab75767;
    uint256 constant PUB_KEY_Y =
        0x927df81dac554897e7f0dc703440638cb91caccfc60f0d65827ab20031ae7387;
    string constant JWKS_URI =
        "https://api.insumermodel.com/.well-known/jwks.json";

    // ── Live fixture ──
    address constant FIXTURE_WALLET =
        0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045;
    bool constant FIXTURE_PASS = true;
    uint256 constant FIXTURE_BLOCK = 25059553; // hex 0x17e60e1
    bytes32 constant FIXTURE_R =
        0xcb6286e3ba76b5afc73d46055262823fb6172684c060c3bc02a6e36e6a351f6d;
    bytes32 constant FIXTURE_S =
        0xb45217b73396017a02f85f848a2fc4a6c9851109ac04293d2e69c5382cfd5749;
    bytes32 constant FIXTURE_MSG_HASH =
        0x81194a053b1011fd4efab9b0cb7298b225e59367af6231db11ac31ede296801b;

    // The API returns conditionHash as a hex string. Per the production
    // pattern in InsumerKeeperHook, the on-chain commitment is
    // keccak256(abi.encodePacked(<hex string>)).
    string constant API_CONDITION_HASH_HEX =
        "0xc938b71ac78df5843d6823dd78ee0a5b64dd56fa850984e954dd070285169444";

    InsumerAccessPredicate predicate;
    bytes32 expectedConditionHash;

    function setUp() public {
        expectedConditionHash = keccak256(abi.encodePacked(API_CONDITION_HASH_HEX));

        predicate = new InsumerAccessPredicate(
            PUB_KEY_X,
            PUB_KEY_Y,
            expectedConditionHash,
            JWKS_URI
        );

        // Roll the test chain so block.number sits within MAX_BLOCK_AGE
        // of the fixture's blockNumber.
        vm.roll(FIXTURE_BLOCK + 100);
    }

    function _validData() internal view returns (bytes memory) {
        return abi.encode(
            FIXTURE_PASS,
            FIXTURE_WALLET,
            expectedConditionHash,
            FIXTURE_BLOCK,
            FIXTURE_R,
            FIXTURE_S,
            FIXTURE_MSG_HASH
        );
    }

    // ──────────────────────────────────────────────
    // Happy path: real P-256 verification end-to-end
    // ──────────────────────────────────────────────

    function test_HasAccess_ValidAttestation() public view {
        assertTrue(
            predicate.hasAccess(0, FIXTURE_WALLET, _validData()),
            "valid attestation must pass"
        );
    }

    // ──────────────────────────────────────────────
    // Failure modes
    // ──────────────────────────────────────────────

    function test_HasAccess_TamperedSignatureR() public view {
        bytes32 tamperedR = bytes32(uint256(FIXTURE_R) ^ 1);
        bytes memory data = abi.encode(
            FIXTURE_PASS,
            FIXTURE_WALLET,
            expectedConditionHash,
            FIXTURE_BLOCK,
            tamperedR,
            FIXTURE_S,
            FIXTURE_MSG_HASH
        );
        assertFalse(
            predicate.hasAccess(0, FIXTURE_WALLET, data),
            "tampered r must fail"
        );
    }

    function test_HasAccess_TamperedMessageHash() public view {
        bytes32 tamperedMsg = bytes32(uint256(FIXTURE_MSG_HASH) ^ 1);
        bytes memory data = abi.encode(
            FIXTURE_PASS,
            FIXTURE_WALLET,
            expectedConditionHash,
            FIXTURE_BLOCK,
            FIXTURE_R,
            FIXTURE_S,
            tamperedMsg
        );
        assertFalse(
            predicate.hasAccess(0, FIXTURE_WALLET, data),
            "tampered message hash must fail"
        );
    }

    function test_HasAccess_WrongAccount() public view {
        address other = address(0xCAFE);
        assertFalse(
            predicate.hasAccess(0, other, _validData()),
            "wrong account must fail"
        );
    }

    function test_HasAccess_WrongConditionHashInData() public view {
        bytes32 wrongHash = bytes32(uint256(expectedConditionHash) ^ 1);
        bytes memory data = abi.encode(
            FIXTURE_PASS,
            FIXTURE_WALLET,
            wrongHash,
            FIXTURE_BLOCK,
            FIXTURE_R,
            FIXTURE_S,
            FIXTURE_MSG_HASH
        );
        assertFalse(
            predicate.hasAccess(0, FIXTURE_WALLET, data),
            "wrong condition hash in data must fail"
        );
    }

    function test_HasAccess_PassFalseFromIssuer() public view {
        bytes memory data = abi.encode(
            false,
            FIXTURE_WALLET,
            expectedConditionHash,
            FIXTURE_BLOCK,
            FIXTURE_R,
            FIXTURE_S,
            FIXTURE_MSG_HASH
        );
        assertFalse(
            predicate.hasAccess(0, FIXTURE_WALLET, data),
            "pass=false must fail"
        );
    }

    function test_HasAccess_StaleAttestation() public {
        vm.roll(FIXTURE_BLOCK + 901); // beyond MAX_BLOCK_AGE
        assertFalse(
            predicate.hasAccess(0, FIXTURE_WALLET, _validData()),
            "stale attestation must fail"
        );
    }

    function test_HasAccess_FutureAttestation() public {
        vm.roll(FIXTURE_BLOCK - 1); // before the attested block
        assertFalse(
            predicate.hasAccess(0, FIXTURE_WALLET, _validData()),
            "future-dated attestation must fail"
        );
    }

    function test_HasAccess_EmptyData() public view {
        assertFalse(
            predicate.hasAccess(0, FIXTURE_WALLET, ""),
            "empty data must fail"
        );
    }

    // ──────────────────────────────────────────────
    // Introspection
    // ──────────────────────────────────────────────

    function test_GetRequirements_Shape() public view {
        (AccessRequirement[] memory reqs, RequirementLogic logic) =
            predicate.getRequirements(0);

        assertEq(reqs.length, 1, "exactly one requirement");
        assertEq(
            reqs[0].kind,
            type(IWalletStateAttestation).interfaceId,
            "kind == IWalletStateAttestation.interfaceId"
        );
        assertEq(
            uint8(logic),
            uint8(RequirementLogic.AND),
            "logic == AND"
        );

        (string memory uri, bytes32 hash) =
            abi.decode(reqs[0].data, (string, bytes32));
        assertEq(uri, JWKS_URI, "issuer JWKS URI matches");
        assertEq(hash, expectedConditionHash, "condition hash matches");
    }

    function test_WalletStateAttestation_SelectorPinned() public pure {
        // bytes4(keccak256("walletStateAttestation()")) = 0x7a111640
        assertEq(
            type(IWalletStateAttestation).interfaceId,
            bytes4(0x7a111640),
            "marker interfaceId pinned"
        );
    }

    function test_SupportsInterface_AccessPredicate() public view {
        assertTrue(
            predicate.supportsInterface(type(IAccessPredicate).interfaceId)
        );
    }

    function test_SupportsInterface_ERC165() public view {
        assertTrue(predicate.supportsInterface(type(IERC165).interfaceId));
    }

    function test_SupportsInterface_RandomFalse() public view {
        assertFalse(predicate.supportsInterface(0xdeadbeef));
    }

    function test_Name() public view {
        assertEq(predicate.name(), "InsumerAccessPredicate");
    }

    // ──────────────────────────────────────────────
    // Spec parity
    // ──────────────────────────────────────────────

    function test_AccessPredicate_InterfaceIdMatchesSpec() public pure {
        // ERC-8257 spec line 965 pins IAccessPredicate.interfaceId at
        // 0xbdf9dc18. Confirms the inlined interface in the predicate
        // matches the spec exactly.
        assertEq(
            type(IAccessPredicate).interfaceId,
            bytes4(0xbdf9dc18),
            "IAccessPredicate.interfaceId matches spec line 965"
        );
    }
}
