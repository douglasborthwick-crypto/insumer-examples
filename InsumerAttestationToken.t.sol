// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InsumerAttestationToken} from "./InsumerAttestationToken.sol";

/// @dev Exposes the library so its reader can be called directly.
contract TokenReader {
    function read(bytes calldata token, uint256 x, uint256 y)
        external view returns (bool ok, InsumerAttestationToken.Claims memory c)
    {
        return InsumerAttestationToken.read(token, x, y);
    }
}

/// @title InsumerAttestationToken tests
/// @notice The reader returns the signed claims of real tokens exactly, and
///         reads nothing from an oversized or unsigned input.
contract InsumerAttestationTokenTest is Test {
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

    TokenReader reader;

    function setUp() public {
        reader = new TokenReader();
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

    function test_ReadsLiveClaims() public view {
        (bool ok, InsumerAttestationToken.Claims memory c) = reader.read(bytes(LIVE_JWT), PUB_KEY_X, PUB_KEY_Y);
        assertTrue(ok);
        assertEq(c.sub, LIVE_WALLET);
        assertTrue(c.pass);
        assertEq(c.conditionHash, LIVE_CONDITION_HASH);
        assertEq(c.exp, LIVE_EXP);
    }

    function test_ReadsPassFalse() public view {
        (uint256 x, uint256 y) = vm.publicKeyP256(TEST_PK);
        string memory cond = "0x1111111111111111111111111111111111111111111111111111111111111111";
        (bool ok, InsumerAttestationToken.Claims memory c) =
            reader.read(_token(_payload("0x00000000000000000000000000000000000000aa", "false", cond, LIVE_EXP)), x, y);
        assertTrue(ok, "a failing verdict is still a readable token");
        assertFalse(c.pass);
        assertEq(c.sub, address(0xAA));
    }

    function test_WrongKeyReadsNothing() public view {
        (uint256 x, uint256 y) = vm.publicKeyP256(TEST_PK);
        (bool ok,) = reader.read(bytes(LIVE_JWT), x, y);
        assertFalse(ok);
    }

    function test_OverlongHeaderReadsNothing() public view {
        bytes memory t = bytes(LIVE_JWT);
        uint256 dot1 = 0;
        while (t[dot1] != ".") dot1++;
        bytes memory pad = new bytes(300 - dot1);
        for (uint256 i = 0; i < pad.length; i++) pad[i] = "A";
        bytes memory head = new bytes(dot1);
        for (uint256 i = 0; i < dot1; i++) head[i] = t[i];
        bytes memory rest = new bytes(t.length - dot1);
        for (uint256 i = 0; i < rest.length; i++) rest[i] = t[dot1 + i];
        (bool ok,) = reader.read(abi.encodePacked(head, pad, rest), PUB_KEY_X, PUB_KEY_Y);
        assertFalse(ok);
    }

    /// @dev Inputs over 64 KB read as nothing, cheaply, instead of running
    ///      out of gas.
    function test_OversizeInputReadsNothing() public view {
        bytes memory big = new bytes(65537);
        uint256 g = gasleft();
        (bool ok,) = reader.read(big, PUB_KEY_X, PUB_KEY_Y);
        assertFalse(ok);
        assertLt(g - gasleft(), 200_000);
    }
}
