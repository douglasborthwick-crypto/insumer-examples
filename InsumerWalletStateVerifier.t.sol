// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InsumerWalletStateVerifier} from "./InsumerWalletStateVerifier.sol";

/// @title InsumerWalletStateVerifier tests
/// @notice Anchored mode stores only what a signed token says, from any
///         submitter; fallback mode is the relayer's alone.
contract InsumerWalletStateVerifierTest is Test {
    uint256 constant PUB_KEY_X =
        0x26d1cf8433e7bfc01f3f4252946badc5b3a5c6b795d8285ecb6ed9efaab75767;
    uint256 constant PUB_KEY_Y =
        0x927df81dac554897e7f0dc703440638cb91caccfc60f0d65827ab20031ae7387;
    string constant LIVE_JWT =
        "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Imluc3VtZXItYXR0ZXN0LXYyIn0.eyJwYXNzIjp0cnVlLCJjb25kaXRpb25IYXNoIjpbIjB4NzQ2MTgyNjYzOGEyMzg2MjA1OWRhOTQ3NGZhMTIwNTQ4MjlmNjk0MDIwNzAxNDkxZDY2MDM5NWI4N2RmNjEzMiJdLCJibG9ja051bWJlciI6IjB4MThkMDcwMSIsImJsb2NrVGltZXN0YW1wIjoiMjAyNi0wOS0yMFQxNToyMDozNS4wMDBaIiwicmVzdWx0cyI6W3siY29uZGl0aW9uIjowLCJsYWJlbCI6IlVTREMgPj0gMSIsInR5cGUiOiJ0b2tlbl9iYWxhbmNlIiwiY2hhaW5JZCI6MSwibWV0Ijp0cnVlLCJldmFsdWF0ZWRDb25kaXRpb24iOnsidHlwZSI6InRva2VuX2JhbGFuY2UiLCJjaGFpbklkIjoxLCJjb250cmFjdEFkZHJlc3MiOiIweEEwYjg2OTkxYzYyMThiMzZjMWQxOUQ0YTJlOUViMGNFMzYwNmVCNDgiLCJvcGVyYXRvciI6Imd0ZSIsInRocmVzaG9sZCI6IjEifSwiY29uZGl0aW9uSGFzaCI6IjB4NzQ2MTgyNjYzOGEyMzg2MjA1OWRhOTQ3NGZhMTIwNTQ4MjlmNjk0MDIwNzAxNDkxZDY2MDM5NWI4N2RmNjEzMiIsImJsb2NrTnVtYmVyIjoiMHgxOGQwNzAxIiwiYmxvY2tUaW1lc3RhbXAiOiIyMDI2LTA5LTIwVDE1OjIwOjM1LjAwMFoifV0sImlzcyI6Imh0dHBzOi8vYXBpLmluc3VtZXJtb2RlbC5jb20iLCJzdWIiOiIweGQ4ZEE2QkYyNjk2NGFGOUQ3ZUVkOWUwM0U1MzQxNUQzN2FBOTYwNDUiLCJqdGkiOiJBVFNULUVEMUM2RTg5QkQ2M0ZGNjIiLCJpYXQiOjE3ODk5MTc2NDMsImV4cCI6MTc4OTkxOTQ0M30.zOHmNwLujYyfCWN39yc3XFUo6FsQowH8kuYjKWv2gIMYsJU_KFHQ--S6Cg3qLE_w-BC3VU6PBYAhgWDpcNEsVQ";
    address constant LIVE_WALLET = 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045;
    bytes32 constant LIVE_CONDITION_HASH =
        0x7461826638a23862059da9474fa12054829f694020701491d660395b87df6132;
    uint256 constant LIVE_IAT = 1789917643;
    uint256 constant LIVE_EXP = 1789919443;
    uint256 constant TEST_PK = 0xA11CE;
    string constant HEADER = '{"alg":"ES256","typ":"JWT","kid":"insumer-attest-v2"}';
    string constant ERA_V1_JWT =
        "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Imluc3VtZXItYXR0ZXN0LXYxIn0.eyJwYXNzIjp0cnVlLCJjb25kaXRpb25IYXNoIjpbIjB4YzkzOGI3MWFjNzhkZjU4NDNkNjgyM2RkNzhlZTBhNWI2NGRkNTZmYTg1MDk4NGU5NTRkZDA3MDI4NTE2OTQ0NCJdLCJibG9ja051bWJlciI6IjB4MThkNzhjZCIsImJsb2NrVGltZXN0YW1wIjoiMjAyNi0wOS0yNFQxNzoxMDo1OS4wMDBaIiwicmVzdWx0cyI6W3siY29uZGl0aW9uIjowLCJsYWJlbCI6IlVTREMgPj0gMSIsInR5cGUiOiJ0b2tlbl9iYWxhbmNlIiwiY2hhaW5JZCI6MSwibWV0Ijp0cnVlLCJldmFsdWF0ZWRDb25kaXRpb24iOnsidHlwZSI6InRva2VuX2JhbGFuY2UiLCJjaGFpbklkIjoxLCJjb250cmFjdEFkZHJlc3MiOiIweEEwYjg2OTkxYzYyMThiMzZjMWQxOUQ0YTJlOUViMGNFMzYwNmVCNDgiLCJvcGVyYXRvciI6Imd0ZSIsInRocmVzaG9sZCI6MSwiZGVjaW1hbHMiOjZ9LCJjb25kaXRpb25IYXNoIjoiMHhjOTM4YjcxYWM3OGRmNTg0M2Q2ODIzZGQ3OGVlMGE1YjY0ZGQ1NmZhODUwOTg0ZTk1NGRkMDcwMjg1MTY5NDQ0IiwiYmxvY2tOdW1iZXIiOiIweDE4ZDc4Y2QiLCJibG9ja1RpbWVzdGFtcCI6IjIwMjYtMDktMjRUMTc6MTA6NTkuMDAwWiJ9XSwiaXNzIjoiaHR0cHM6Ly9hcGkuaW5zdW1lcm1vZGVsLmNvbSIsInN1YiI6IjB4ZDhkQTZCRjI2OTY0YUY5RDdlRWQ5ZTAzRTUzNDE1RDM3YUE5NjA0NSIsImp0aSI6IkFUU1QtNURDQzg1RTc3MjY4N0UwQSIsImlhdCI6MTc5MDI2OTg2OSwiZXhwIjoxNzkwMjcxNjY5fQ.JU4KwRAFl6VRJuZj6OY5jwJB2UUPd7K9t0FBN0atCT_NxIizVY9U0YfyxTCZR0iA1CirbLLijRM2WdBBREnktA";
    bytes32 constant ERA_V1_CONDITION = 0xc938b71ac78df5843d6823dd78ee0a5b64dd56fa850984e954dd070285169444;

    string constant COND = "0x1111111111111111111111111111111111111111111111111111111111111111";
    bytes32 constant COND_HASH = 0x1111111111111111111111111111111111111111111111111111111111111111;
    address constant HOLDER = 0x00000000000000000000000000000000000000AA;

    InsumerWalletStateVerifier live;
    InsumerWalletStateVerifier crafted;
    InsumerWalletStateVerifier fallbackMode;
    address relayer = address(0x5E1A);

    function setUp() public {
        live = new InsumerWalletStateVerifier(address(0), PUB_KEY_X, PUB_KEY_Y);
        (uint256 x, uint256 y) = vm.publicKeyP256(TEST_PK);
        crafted = new InsumerWalletStateVerifier(address(0), x, y);
        fallbackMode = new InsumerWalletStateVerifier(relayer, 0, 0);
        vm.warp(LIVE_IAT + 60);
    }

    function _b64(bytes memory data) internal pure returns (string memory) {
        bytes memory e = bytes(vm.toBase64URL(data));
        uint256 n = e.length;
        while (n > 0 && e[n - 1] == "=") n--;
        bytes memory out = new bytes(n);
        for (uint256 i = 0; i < n; i++) out[i] = e[i];
        return string(out);
    }

    function _token(string memory payload) internal pure returns (bytes memory) {
        bytes memory signingInput = abi.encodePacked(_b64(bytes(HEADER)), ".", _b64(bytes(payload)));
        (bytes32 r, bytes32 s) = vm.signP256(TEST_PK, sha256(signingInput));
        return abi.encodePacked(signingInput, ".", _b64(abi.encodePacked(r, s)));
    }

    function _payload(string memory sub, string memory pass, string memory cond, uint256 exp)
        internal pure returns (string memory)
    {
        return string.concat(
            '{"pass":', pass, ',"conditionHash":["', cond, '"],"results":[{"met":true}]',
            ',"iss":"https://api.insumermodel.com","sub":"', sub,
            '","jti":"ATST-TEST","iat":', vm.toString(LIVE_IAT), ',"exp":', vm.toString(exp), "}"
        );
    }

    string constant HOLDER_HEX = "0x00000000000000000000000000000000000000aa";

    function test_AnyoneSubmitsLiveToken_StoresSignedValues() public {
        vm.prank(address(0xBEEF));
        live.submitAttestation(bytes(LIVE_JWT));
        (bool verified, uint256 validUntil) = live.checkWalletState(LIVE_WALLET, LIVE_CONDITION_HASH);
        assertTrue(verified);
        assertEq(validUntil, LIVE_EXP);
    }

    function test_V1KeyTokenStoresUnderItsOwnConditionHash() public {
        vm.warp(1790269877 + 60);
        live.submitAttestation(bytes(ERA_V1_JWT));
        (bool verified,) = live.checkWalletState(LIVE_WALLET, ERA_V1_CONDITION);
        assertTrue(verified);
    }

    function test_NothingStoredForAnyOtherWalletOrCondition() public {
        live.submitAttestation(bytes(LIVE_JWT));
        (bool v1,) = live.checkWalletState(address(0xBAD), LIVE_CONDITION_HASH);
        (bool v2,) = live.checkWalletState(LIVE_WALLET, COND_HASH);
        assertFalse(v1);
        assertFalse(v2);
    }

    /// @dev There is no entry point taking caller-written values beside a
    ///      signature; such calldata reverts and stores nothing.
    function test_SevenArgumentSubmitDoesNotExist() public {
        (bool ok,) = address(live).call(abi.encodeWithSignature(
            "submitAttestation(address,bytes32,bool,uint256,bytes32,bytes32,bytes32)",
            address(0xBAD), LIVE_CONDITION_HASH, true, LIVE_EXP, bytes32(0), bytes32(0), bytes32(0)
        ));
        assertFalse(ok);
        (bool verified,) = live.checkWalletState(address(0xBAD), LIVE_CONDITION_HASH);
        assertFalse(verified);
    }

    function test_EditedTokenReverts() public {
        bytes memory t = bytes(LIVE_JWT);
        t[t.length - 5] = t[t.length - 5] == "A" ? bytes1("B") : bytes1("A");
        vm.expectRevert(InsumerWalletStateVerifier.InvalidToken.selector);
        live.submitAttestation(t);
    }

    function test_ExpiredTokenReverts() public {
        vm.warp(LIVE_EXP);
        vm.expectRevert(InsumerWalletStateVerifier.ExpiredToken.selector);
        live.submitAttestation(bytes(LIVE_JWT));
    }

    function test_FailingVerdictReadsAsNotVerified() public {
        crafted.submitAttestation(_token(_payload(HOLDER_HEX, "false", COND, LIVE_EXP)));
        (bool verified, uint256 validUntil) = crafted.checkWalletState(HOLDER, COND_HASH);
        assertFalse(verified);
        assertEq(validUntil, 0);
    }

    function test_PassingVerdictReadsAsNotVerifiedFromExpiry() public {
        live.submitAttestation(bytes(LIVE_JWT));
        vm.warp(LIVE_EXP - 1);
        (bool before,) = live.checkWalletState(LIVE_WALLET, LIVE_CONDITION_HASH);
        assertTrue(before);
        vm.warp(LIVE_EXP);
        (bool atExp, uint256 validUntil) = live.checkWalletState(LIVE_WALLET, LIVE_CONDITION_HASH);
        assertFalse(atExp);
        assertEq(validUntil, 0);
    }

    function test_SameSecondTie_FirstSubmittedStays() public {
        crafted.submitAttestation(_token(_payload(HOLDER_HEX, "true", COND, LIVE_EXP)));
        bytes memory twin = _token(_payload(HOLDER_HEX, "false", COND, LIVE_EXP));
        vm.expectRevert(InsumerWalletStateVerifier.NotNewer.selector);
        crafted.submitAttestation(twin);
        (bool verified,) = crafted.checkWalletState(HOLDER, COND_HASH);
        assertTrue(verified);
    }

    /// @dev A 5-minute token (as for an erc7710_delegation condition) stores
    ///      its own expiry.
    function test_ShortLifetimeTokenStoresItsExpiry() public {
        crafted.submitAttestation(_token(_payload(HOLDER_HEX, "true", COND, LIVE_IAT + 300)));
        (bool verified, uint256 validUntil) = crafted.checkWalletState(HOLDER, COND_HASH);
        assertTrue(verified);
        assertEq(validUntil, LIVE_IAT + 300);
    }

    function test_NewerTokenReplacesOlder_OlderCannotReplaceNewer() public {
        crafted.submitAttestation(_token(_payload(HOLDER_HEX, "true", COND, LIVE_EXP)));
        crafted.submitAttestation(_token(_payload(HOLDER_HEX, "false", COND, LIVE_EXP + 10)));
        (bool verified,) = crafted.checkWalletState(HOLDER, COND_HASH);
        assertFalse(verified, "newer verdict wins");
        bytes memory older = _token(_payload(HOLDER_HEX, "true", COND, LIVE_EXP));
        vm.expectRevert(InsumerWalletStateVerifier.NotNewer.selector);
        crafted.submitAttestation(older);
    }

    function test_NonEvmSubjectReverts() public {
        bytes memory t = _token(_payload("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "true", COND, LIVE_EXP));
        vm.expectRevert(InsumerWalletStateVerifier.InvalidToken.selector);
        crafted.submitAttestation(t);
    }

    function test_FallbackMode_RelayerOnly_TokensRefused() public {
        vm.expectRevert(InsumerWalletStateVerifier.FallbackMode.selector);
        fallbackMode.submitAttestation(bytes(LIVE_JWT));
        vm.expectRevert(InsumerWalletStateVerifier.NotRelayer.selector);
        fallbackMode.submitTrustedResult(HOLDER, COND_HASH, true, LIVE_EXP);
        vm.prank(relayer);
        fallbackMode.submitTrustedResult(HOLDER, COND_HASH, true, LIVE_EXP);
        (bool verified,) = fallbackMode.checkWalletState(HOLDER, COND_HASH);
        assertTrue(verified);
    }

    function test_AnchoredMode_TrustedResultRefused() public {
        vm.expectRevert(InsumerWalletStateVerifier.AnchoredMode.selector);
        live.submitTrustedResult(HOLDER, COND_HASH, true, LIVE_EXP);
    }

    function test_PartialKeyRefused() public {
        vm.expectRevert(InsumerWalletStateVerifier.PartialKey.selector);
        new InsumerWalletStateVerifier(relayer, PUB_KEY_X, 0);
        vm.expectRevert(InsumerWalletStateVerifier.PartialKey.selector);
        new InsumerWalletStateVerifier(relayer, 0, PUB_KEY_Y);
    }

    function test_FallbackModeNeedsRelayer() public {
        vm.expectRevert(InsumerWalletStateVerifier.ZeroAddress.selector);
        new InsumerWalletStateVerifier(address(0), 0, 0);
    }
}
