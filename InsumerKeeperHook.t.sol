// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InsumerKeeperHook} from "./InsumerKeeperHook.sol";

/// @title InsumerKeeperHook tests
/// @notice beforeKeep passes only on a signed token naming the merchant, the
///         subscription's condition and a passing, unexpired verdict.
contract InsumerKeeperHookTest is Test {
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
    address constant MERCHANT = 0x00000000000000000000000000000000000000AA;
    string constant MERCHANT_HEX = "0x00000000000000000000000000000000000000aa";
    bytes32 constant SUB_ID = keccak256("subscription-1");

    InsumerKeeperHook live;
    InsumerKeeperHook crafted;

    function setUp() public {
        live = new InsumerKeeperHook(PUB_KEY_X, PUB_KEY_Y, address(0));
        live.setConditionHash(SUB_ID, LIVE_CONDITION_HASH);
        (uint256 x, uint256 y) = vm.publicKeyP256(TEST_PK);
        crafted = new InsumerKeeperHook(x, y, address(0));
        crafted.setConditionHash(SUB_ID, COND_HASH);
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

    function test_LiveTokenForMerchantPasses() public {
        vm.expectEmit(true, false, false, true);
        emit InsumerKeeperHook.AttestationVerified(SUB_ID, 7, LIVE_WALLET);
        live.beforeKeep(SUB_ID, 7, 1e6, LIVE_WALLET, bytes(LIVE_JWT));
    }

    function test_OtherMerchantReverts() public {
        vm.expectRevert(InsumerKeeperHook.WalletMismatch.selector);
        live.beforeKeep(SUB_ID, 1, 1e6, address(0xBAD), bytes(LIVE_JWT));
    }

    function test_OtherSubscriptionConditionReverts() public {
        vm.expectRevert(InsumerKeeperHook.ConditionMismatch.selector);
        live.beforeKeep(keccak256("unconfigured"), 1, 1e6, LIVE_WALLET, bytes(LIVE_JWT));
    }

    function test_ExpiredReverts() public {
        vm.warp(LIVE_EXP);
        vm.expectRevert(InsumerKeeperHook.AttestationExpired.selector);
        live.beforeKeep(SUB_ID, 1, 1e6, LIVE_WALLET, bytes(LIVE_JWT));
    }

    function test_EditedTokenReverts() public {
        bytes memory t = bytes(LIVE_JWT);
        t[t.length - 5] = t[t.length - 5] == "A" ? bytes1("B") : bytes1("A");
        vm.expectRevert(InsumerKeeperHook.InvalidToken.selector);
        live.beforeKeep(SUB_ID, 1, 1e6, LIVE_WALLET, t);
    }

    /// @dev A genuine signature beside caller-written fields is not a token,
    ///      so it cannot pass.
    function test_SevenFieldTupleReverts() public {
        bytes memory forged = abi.encode(
            true, MERCHANT, LIVE_CONDITION_HASH, uint256(1),
            bytes32(0xcb6286e3ba76b5afc73d46055262823fb6172684c060c3bc02a6e36e6a351f6d),
            bytes32(0xb45217b73396017a02f85f848a2fc4a6c9851109ac04293d2e69c5382cfd5749),
            bytes32(0x81194a053b1011fd4efab9b0cb7298b225e59367af6231db11ac31ede296801b)
        );
        vm.expectRevert(InsumerKeeperHook.InvalidToken.selector);
        live.beforeKeep(SUB_ID, 1, 1e6, MERCHANT, forged);
    }

    function test_FailingVerdictReverts() public {
        bytes memory t = _token(_payload(MERCHANT_HEX, "false", COND, LIVE_EXP));
        vm.expectRevert(InsumerKeeperHook.AttestationFailed.selector);
        crafted.beforeKeep(SUB_ID, 1, 1e6, MERCHANT, t);
    }

    function test_CraftedPassingTokenPasses() public {
        crafted.beforeKeep(SUB_ID, 1, 1e6, MERCHANT, _token(_payload(MERCHANT_HEX, "true", COND, LIVE_EXP)));
    }

    function test_PinnedCallerOnly() public {
        address manager = address(0x8191);
        InsumerKeeperHook pinned = new InsumerKeeperHook(PUB_KEY_X, PUB_KEY_Y, manager);
        pinned.setConditionHash(SUB_ID, LIVE_CONDITION_HASH);
        vm.expectRevert(InsumerKeeperHook.NotKeeperCaller.selector);
        pinned.beforeKeep(SUB_ID, 1, 1e6, LIVE_WALLET, bytes(LIVE_JWT));
        vm.prank(manager);
        pinned.beforeKeep(SUB_ID, 1, 1e6, LIVE_WALLET, bytes(LIVE_JWT));
        vm.expectRevert(InsumerKeeperHook.NotKeeperCaller.selector);
        pinned.afterKeep(SUB_ID, 1, 1e6, LIVE_WALLET, "");
    }

    function test_OnlySubscriberConfigures() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(InsumerKeeperHook.NotSubscriber.selector);
        live.setConditionHash(SUB_ID, COND_HASH);
    }
}
