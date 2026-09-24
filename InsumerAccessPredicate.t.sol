// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {
    InsumerAccessPredicate,
    IAccessPredicate,
    IERC165,
    AccessRequirement,
    RequirementLogic
} from "./InsumerAccessPredicate.sol";
import {IWalletStateAttestation} from "./IWalletStateAttestation.sol";

/// @title InsumerAccessPredicate tests
/// @notice Real tokens issued by InsumerAPI verify end to end: 2026-09-20
///         (vectors/26-jwt-format-whole-response.json), 2026-09-01 (vector
///         17), and one each from a v1 and a v2 key on 2026-09-24. Wallet
///         0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045, condition USDC >= 1 on
///         Ethereum. Structural cases use tokens signed in the test with a
///         throwaway P-256 key.
contract InsumerAccessPredicateTest is Test {
    // ── JWKS coordinates (the attestation EC key, ES256, P-256) ──
    uint256 constant PUB_KEY_X =
        0x26d1cf8433e7bfc01f3f4252946badc5b3a5c6b795d8285ecb6ed9efaab75767;
    uint256 constant PUB_KEY_Y =
        0x927df81dac554897e7f0dc703440638cb91caccfc60f0d65827ab20031ae7387;
    string constant JWKS_URI =
        "https://api.insumermodel.com/.well-known/jwks.json";

    // ── Live token ──
    string constant LIVE_JWT =
        "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Imluc3VtZXItYXR0ZXN0LXYyIn0.eyJwYXNzIjp0cnVlLCJjb25kaXRpb25IYXNoIjpbIjB4NzQ2MTgyNjYzOGEyMzg2MjA1OWRhOTQ3NGZhMTIwNTQ4MjlmNjk0MDIwNzAxNDkxZDY2MDM5NWI4N2RmNjEzMiJdLCJibG9ja051bWJlciI6IjB4MThkMDcwMSIsImJsb2NrVGltZXN0YW1wIjoiMjAyNi0wOS0yMFQxNToyMDozNS4wMDBaIiwicmVzdWx0cyI6W3siY29uZGl0aW9uIjowLCJsYWJlbCI6IlVTREMgPj0gMSIsInR5cGUiOiJ0b2tlbl9iYWxhbmNlIiwiY2hhaW5JZCI6MSwibWV0Ijp0cnVlLCJldmFsdWF0ZWRDb25kaXRpb24iOnsidHlwZSI6InRva2VuX2JhbGFuY2UiLCJjaGFpbklkIjoxLCJjb250cmFjdEFkZHJlc3MiOiIweEEwYjg2OTkxYzYyMThiMzZjMWQxOUQ0YTJlOUViMGNFMzYwNmVCNDgiLCJvcGVyYXRvciI6Imd0ZSIsInRocmVzaG9sZCI6IjEifSwiY29uZGl0aW9uSGFzaCI6IjB4NzQ2MTgyNjYzOGEyMzg2MjA1OWRhOTQ3NGZhMTIwNTQ4MjlmNjk0MDIwNzAxNDkxZDY2MDM5NWI4N2RmNjEzMiIsImJsb2NrTnVtYmVyIjoiMHgxOGQwNzAxIiwiYmxvY2tUaW1lc3RhbXAiOiIyMDI2LTA5LTIwVDE1OjIwOjM1LjAwMFoifV0sImlzcyI6Imh0dHBzOi8vYXBpLmluc3VtZXJtb2RlbC5jb20iLCJzdWIiOiIweGQ4ZEE2QkYyNjk2NGFGOUQ3ZUVkOWUwM0U1MzQxNUQzN2FBOTYwNDUiLCJqdGkiOiJBVFNULUVEMUM2RTg5QkQ2M0ZGNjIiLCJpYXQiOjE3ODk5MTc2NDMsImV4cCI6MTc4OTkxOTQ0M30.zOHmNwLujYyfCWN39yc3XFUo6FsQowH8kuYjKWv2gIMYsJU_KFHQ--S6Cg3qLE_w-BC3VU6PBYAhgWDpcNEsVQ";
    address constant LIVE_WALLET = 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045;
    string constant LIVE_CONDITION_HASH_HEX =
        "0x7461826638a23862059da9474fa12054829f694020701491d660395b87df6132";
    bytes32 constant LIVE_CONDITION_HASH =
        0x7461826638a23862059da9474fa12054829f694020701491d660395b87df6132;
    uint256 constant LIVE_IAT = 1789917643;
    uint256 constant LIVE_EXP = 1789919443;

    // ── Throwaway key for crafted tokens ──
    uint256 constant TEST_PK = 0xA11CE;
    string constant HEADER = '{"alg":"ES256","typ":"JWT","kid":"insumer-attest-v2"}';
    string constant COND = "0x1111111111111111111111111111111111111111111111111111111111111111";
    bytes32 constant COND_HASH = 0x1111111111111111111111111111111111111111111111111111111111111111;

    // Real signatures by the pinned key over the other messages it signs.
    bytes constant REAL_V2_PREIMAGE = hex"696e73756d65722e6174746573746174696f6e2e76320a7b2261747465737465644174223a22323032362d30392d32305431353a32303a34332e3133335a222c226964223a22415453542d45443143364538394244363346463632222c2270617373223a747275652c22726573756c7473223a5b7b22626c6f636b4e756d626572223a22307831386430373031222c22626c6f636b54696d657374616d70223a22323032362d30392d32305431353a32303a33352e3030305a222c22636861696e4964223a312c22636f6e646974696f6e223a302c22636f6e646974696f6e48617368223a22307837343631383236363338613233383632303539646139343734666131323035343832396636393430323037303134393164363630333935623837646636313332222c226576616c7561746564436f6e646974696f6e223a7b22636861696e4964223a312c22636f6e747261637441646472657373223a22307841306238363939316336323138623336633164313944346132653945623063453336303665423438222c226f70657261746f72223a22677465222c227468726573686f6c64223a2231222c2274797065223a22746f6b656e5f62616c616e6365227d2c226c6162656c223a2255534443203e3d2031222c226d6574223a747275652c2274797065223a22746f6b656e5f62616c616e6365227d5d2c2276223a327d";
    bytes constant REAL_V2_SIG = hex"d614c9f46fa2c9c756a394c0b122e59662f94e24635da7d3e1352d9c18855925b61c90f024295fb8d54a9d0ab132549f736616d31131bcde9a5d358909861147";
    bytes constant REAL_V1_PREIMAGE = hex"7b226964223a22415453542d46444243314432324542423445463245222c2270617373223a747275652c22726573756c7473223a5b7b22636f6e646974696f6e223a302c226c6162656c223a22222c2274797065223a22746f6b656e5f62616c616e6365222c22636861696e4964223a312c226d6574223a747275652c226576616c7561746564436f6e646974696f6e223a7b2274797065223a22746f6b656e5f62616c616e6365222c22636861696e4964223a312c22636f6e747261637441646472657373223a22307841306238363939316336323138623336633164313944346132653945623063453336303665423438222c226f70657261746f72223a22677465222c227468726573686f6c64223a312c22646563696d616c73223a367d2c22636f6e646974696f6e48617368223a22307863393338623731616337386466353834336436383233646437386565306135623634646435366661383530393834653935346464303730323835313639343434222c22626c6f636b4e756d626572223a22307831386166633832222c22626c6f636b54696d657374616d70223a22323032362d30392d30315432333a34393a32332e3030305a227d5d2c2261747465737465644174223a22323032362d30392d30315432333a34393a33332e3432335a227d";
    bytes constant REAL_V1_SIG = hex"921d7327a8dd4adf1ae642c56bcd86571c96d324f0655b5e127afa6ec84aabdaf774fcab250a78037438cea060592dbf9e8b688c35f3d1fe8ecdae563f8ae2aa";
    string constant BINDING_PREIMAGE =
        "insumer.pq_key_binding.v1.classical\n0xaac0fc363786984842ee9c61680411fff9dcfc80734bcb09dc33a9ebb3521600";
    bytes constant BINDING_SIG = hex"60c9976c8901c23e71a7650109ed206441564b2e54d8626fdd8ccefe384abdc7b4dce50d6e9bfea6a04a46f04f339c823970f81cef9df4527430f2dde32d4b1a";

    // Vector 17: a second real token, issued 2026-09-01.
    string constant LIVE_JWT_17 =
        "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Imluc3VtZXItYXR0ZXN0LXYyIn0.eyJwYXNzIjp0cnVlLCJjb25kaXRpb25IYXNoIjpbIjB4NzQ2MTgyNjYzOGEyMzg2MjA1OWRhOTQ3NGZhMTIwNTQ4MjlmNjk0MDIwNzAxNDkxZDY2MDM5NWI4N2RmNjEzMiJdLCJibG9ja051bWJlciI6IjB4MThhZmM4MiIsImJsb2NrVGltZXN0YW1wIjoiMjAyNi0wOS0wMVQyMzo0OToyMy4wMDBaIiwicmVzdWx0cyI6W3siY29uZGl0aW9uIjowLCJsYWJlbCI6IiIsInR5cGUiOiJ0b2tlbl9iYWxhbmNlIiwiY2hhaW5JZCI6MSwibWV0Ijp0cnVlLCJldmFsdWF0ZWRDb25kaXRpb24iOnsidHlwZSI6InRva2VuX2JhbGFuY2UiLCJjaGFpbklkIjoxLCJjb250cmFjdEFkZHJlc3MiOiIweEEwYjg2OTkxYzYyMThiMzZjMWQxOUQ0YTJlOUViMGNFMzYwNmVCNDgiLCJvcGVyYXRvciI6Imd0ZSIsInRocmVzaG9sZCI6IjEifSwiY29uZGl0aW9uSGFzaCI6IjB4NzQ2MTgyNjYzOGEyMzg2MjA1OWRhOTQ3NGZhMTIwNTQ4MjlmNjk0MDIwNzAxNDkxZDY2MDM5NWI4N2RmNjEzMiIsImJsb2NrTnVtYmVyIjoiMHgxOGFmYzgyIiwiYmxvY2tUaW1lc3RhbXAiOiIyMDI2LTA5LTAxVDIzOjQ5OjIzLjAwMFoifV0sImlzcyI6Imh0dHBzOi8vYXBpLmluc3VtZXJtb2RlbC5jb20iLCJzdWIiOiIweGQ4ZEE2QkYyNjk2NGFGOUQ3ZUVkOWUwM0U1MzQxNUQzN2FBOTYwNDUiLCJqdGkiOiJBVFNULUI5NTA2NUNGRjZGNjc3NzgiLCJpYXQiOjE3ODgzMDY1NzIsImV4cCI6MTc4ODMwODM3Mn0.8csqNesbRSkzqRxbFFruJR44YxwRMGQDqiiS00GnK8I24B2VJF97Xkodcz8ZkratH9sVGBUp7KF5AaVBnOtUMA";
    address constant HOLDER = 0x00000000000000000000000000000000000000AA;

    InsumerAccessPredicate live;
    InsumerAccessPredicate crafted;

    function setUp() public {
        live = new InsumerAccessPredicate(
            PUB_KEY_X, PUB_KEY_Y, LIVE_CONDITION_HASH, JWKS_URI
        );
        (uint256 x, uint256 y) = vm.publicKeyP256(TEST_PK);
        crafted = new InsumerAccessPredicate(x, y, COND_HASH, JWKS_URI);
        vm.warp(LIVE_IAT + 60);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _b64(bytes memory data) internal pure returns (string memory) {
        bytes memory e = bytes(vm.toBase64URL(data));
        uint256 n = e.length;
        while (n > 0 && e[n - 1] == "=") n--;
        bytes memory out = new bytes(n);
        for (uint256 i = 0; i < n; i++) out[i] = e[i];
        return string(out);
    }

    /// @dev Signs `signingInput` with the throwaway key and returns the token.
    function _signRaw(bytes memory signingInput) internal pure returns (bytes memory) {
        (bytes32 r, bytes32 s) = vm.signP256(TEST_PK, sha256(signingInput));
        return abi.encodePacked(signingInput, ".", _b64(abi.encodePacked(r, s)));
    }

    function _token(string memory payload) internal pure returns (bytes memory) {
        return _signRaw(abi.encodePacked(_b64(bytes(HEADER)), ".", _b64(bytes(payload))));
    }

    function _payload(string memory sub, string memory pass, string memory cond, uint256 exp)
        internal pure returns (string memory)
    {
        return string.concat(
            '{"pass":', pass,
            ',"conditionHash":', cond,
            ',"results":[{"condition":0,"label":"x","met":true}]',
            ',"iss":"https://api.insumermodel.com","sub":"', sub,
            '","jti":"ATST-TEST","iat":', vm.toString(LIVE_IAT),
            ',"exp":', vm.toString(exp), "}"
        );
    }

    function _cond() internal pure returns (string memory) {
        return string.concat('["', COND, '"]');
    }

    function _holder() internal pure returns (string memory) {
        return "0x00000000000000000000000000000000000000aa";
    }

    // ──────────────────────────────────────────────
    // Live token
    // ──────────────────────────────────────────────

    function test_Live_ValidToken() public {
        uint256 g = gasleft();
        bool ok = live.hasAccess(0, LIVE_WALLET, bytes(LIVE_JWT));
        console.log("hasAccess gas (live token, %d bytes):", bytes(LIVE_JWT).length, g - gasleft());
        assertTrue(ok, "genuine token for the right wallet must pass");
    }

    function test_Live_UnderRegistryGasCap() public view {
        (bool ok, bytes memory ret) = address(live).staticcall{gas: 200_000}(
            abi.encodeCall(IAccessPredicate.hasAccess, (0, LIVE_WALLET, bytes(LIVE_JWT)))
        );
        assertTrue(ok && abi.decode(ret, (bool)), "must succeed inside the 200k staticcall cap");
    }

    function test_Live_OtherAccount() public view {
        assertFalse(live.hasAccess(0, address(0xBAD), bytes(LIVE_JWT)));
    }

    function test_Live_Expired() public {
        vm.warp(LIVE_EXP);
        assertFalse(live.hasAccess(0, LIVE_WALLET, bytes(LIVE_JWT)), "exp is exclusive");
    }

    function test_Live_OtherPinnedCondition() public {
        InsumerAccessPredicate other = new InsumerAccessPredicate(
            PUB_KEY_X, PUB_KEY_Y, COND_HASH, JWKS_URI
        );
        assertFalse(other.hasAccess(0, LIVE_WALLET, bytes(LIVE_JWT)));
    }

    function test_Live_PayloadEdited() public view {
        bytes memory t = bytes(LIVE_JWT);
        uint256 dot = 0;
        while (t[dot] != ".") dot++;
        t[dot + 10] = t[dot + 10] == "A" ? bytes1("B") : bytes1("A");
        assertFalse(live.hasAccess(0, LIVE_WALLET, t));
    }

    function test_Live_SignatureEdited() public view {
        bytes memory t = bytes(LIVE_JWT);
        uint256 i = t.length - 5;
        t[i] = t[i] == "A" ? bytes1("B") : bytes1("A");
        assertFalse(live.hasAccess(0, LIVE_WALLET, t));
    }

    /// @dev A seven-field ABI tuple carrying a genuine signature beside claims
    ///      the caller wrote grants nothing.
    function test_Live_SevenFieldTupleDenied() public view {
        bytes memory forged = abi.encode(
            true, address(0xBAD), LIVE_CONDITION_HASH, uint256(1),
            bytes32(0xcb6286e3ba76b5afc73d46055262823fb6172684c060c3bc02a6e36e6a351f6d),
            bytes32(0xb45217b73396017a02f85f848a2fc4a6c9851109ac04293d2e69c5382cfd5749),
            bytes32(0x81194a053b1011fd4efab9b0cb7298b225e59367af6231db11ac31ede296801b)
        );
        assertFalse(live.hasAccess(0, address(0xBAD), forged));
    }

    // ──────────────────────────────────────────────
    // Crafted tokens: claims
    // ──────────────────────────────────────────────

    function test_Crafted_Valid() public view {
        bytes memory t = _token(_payload(_holder(), "true", _cond(), LIVE_EXP));
        assertTrue(crafted.hasAccess(0, HOLDER, t));
    }

    function test_Crafted_MixedCaseSubject() public view {
        bytes memory t = _token(_payload("0x00000000000000000000000000000000000000AA", "true", _cond(), LIVE_EXP));
        assertTrue(crafted.hasAccess(0, HOLDER, t));
    }

    function test_Crafted_PassFalse() public view {
        bytes memory t = _token(_payload(_holder(), "false", _cond(), LIVE_EXP));
        assertFalse(crafted.hasAccess(0, HOLDER, t));
    }

    function test_Crafted_PassAsString() public view {
        bytes memory t = _token(_payload(_holder(), '"true"', _cond(), LIVE_EXP));
        assertFalse(crafted.hasAccess(0, HOLDER, t));
    }

    function test_Crafted_TwoConditions() public view {
        string memory two = string.concat('["', COND, '","', COND, '"]');
        bytes memory t = _token(_payload(_holder(), "true", two, LIVE_EXP));
        assertFalse(crafted.hasAccess(0, HOLDER, t));
    }

    function test_Crafted_NonEvmSubject() public view {
        bytes memory t = _token(_payload("7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV", "true", _cond(), LIVE_EXP));
        assertFalse(crafted.hasAccess(0, HOLDER, t));
    }

    function test_Crafted_MissingExp() public view {
        string memory p = string.concat(
            '{"pass":true,"conditionHash":', _cond(), ',"sub":"', _holder(), '"}'
        );
        assertFalse(crafted.hasAccess(0, HOLDER, _token(p)));
    }

    function test_Crafted_DuplicateSubject() public view {
        string memory p = string.concat(
            '{"sub":"', _holder(), '",', "\"pass\":true,\"conditionHash\":", _cond(),
            ',"sub":"', _holder(), '","exp":', vm.toString(LIVE_EXP), "}"
        );
        assertFalse(crafted.hasAccess(0, HOLDER, _token(p)));
    }

    /// @dev Claims nested in `results`, or spelled inside a string value,
    ///      are not top-level claims.
    function test_Crafted_NestedAndQuotedDecoys() public view {
        string memory p = string.concat(
            '{"pass":true,"conditionHash":', _cond(),
            ',"results":[{"sub":"', _holder(), '","label":"\\"sub\\":\\"', _holder(), '\\""}]',
            ',"sub":"0x000000000000000000000000000000000000dEaD","exp":', vm.toString(LIVE_EXP), "}"
        );
        assertFalse(crafted.hasAccess(0, HOLDER, _token(p)));
    }

    /// @dev Condition labels are chosen by whoever requests the attestation
    ///      and sit in the middle of the payload, which is never decoded.
    ///      A 4 KB label changes neither the verdict nor the gas ceiling.
    function test_Crafted_LongLabelStaysUnderGasCap() public view {
        bytes memory label = new bytes(4096);
        for (uint256 i = 0; i < label.length; i++) label[i] = "a";
        string memory p = string.concat(
            '{"pass":true,"conditionHash":', _cond(),
            ',"results":[{"label":"', string(label), '"}]',
            ',"sub":"', _holder(), '","exp":', vm.toString(LIVE_EXP), "}"
        );
        (bool ok, bytes memory ret) = address(crafted).staticcall{gas: 200_000}(
            abi.encodeCall(IAccessPredicate.hasAccess, (0, HOLDER, _token(p)))
        );
        assertTrue(ok && abi.decode(ret, (bool)));
    }

    /// @dev A label that spells out claims is inside a string in the middle
    ///      of the payload; it is never read as a claim.
    function test_Crafted_LabelSpellingClaimsIgnored() public view {
        string memory p = string.concat(
            '{"pass":false,"conditionHash":', _cond(),
            ',"results":[{"label":"\\\",\\\"pass\\\":true,\\\"sub\\\":\\\"', _holder(), '\\\""}]',
            ',"sub":"', _holder(), '","exp":', vm.toString(LIVE_EXP), "}"
        );
        assertFalse(crafted.hasAccess(0, HOLDER, _token(p)));
    }

    /// @dev `pass` and `conditionHash` must lead the payload, as the issuer
    ///      writes them. If they ever move behind `results`, the predicate
    ///      denies rather than guesses.
    function test_Crafted_LeadingClaimsMovedDenies() public view {
        string memory p = string.concat(
            '{"results":[{"met":true}],"pass":true,"conditionHash":', _cond(),
            ',"sub":"', _holder(), '","exp":', vm.toString(LIVE_EXP), "}"
        );
        assertFalse(crafted.hasAccess(0, HOLDER, _token(p)));
    }

    function test_Crafted_TrailingClaimsMovedDenies() public view {
        string memory p = string.concat(
            '{"pass":true,"conditionHash":', _cond(),
            ',"sub":"', _holder(), '","exp":', vm.toString(LIVE_EXP),
            ',"results":[{"met":true}]}'
        );
        assertFalse(crafted.hasAccess(0, HOLDER, _token(p)));
    }

    // ──────────────────────────────────────────────
    // Crafted tokens: structure
    // ──────────────────────────────────────────────

    /// @dev A JSON message signed by the same key, presented as a token, has
    ///      a header that is not base64url and is denied.
    function test_Crafted_JsonPreimageSignatureRejected() public view {
        bytes memory preimage = abi.encodePacked(
            '{"id":"ATST-1","pass":true,"attestedAt":"2026-09-20T15:20:35.000Z"}'
        );
        assertFalse(crafted.hasAccess(0, HOLDER, _signRaw(preimage)));
    }

    function test_EmptyData() public view {
        assertFalse(live.hasAccess(0, LIVE_WALLET, ""));
    }

    function test_NoDots() public view {
        assertFalse(live.hasAccess(0, LIVE_WALLET, "abc"));
    }

    function test_ThreeDots() public view {
        assertFalse(live.hasAccess(0, LIVE_WALLET, bytes(string.concat(LIVE_JWT, ".x"))));
    }

    // ──────────────────────────────────────────────
    // Live tokens from a v1 key and a v2 key (2026-09-24)
    // ──────────────────────────────────────────────

    /// @dev Same condition (USDC >= 1 on Ethereum), same wallet, one token
    ///      from each key era. The eras hash this condition differently, so a
    ///      deployment serves the era whose hash it pins.
    string constant ERA_V1_JWT =
        "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Imluc3VtZXItYXR0ZXN0LXYxIn0.eyJwYXNzIjp0cnVlLCJjb25kaXRpb25IYXNoIjpbIjB4YzkzOGI3MWFjNzhkZjU4NDNkNjgyM2RkNzhlZTBhNWI2NGRkNTZmYTg1MDk4NGU5NTRkZDA3MDI4NTE2OTQ0NCJdLCJibG9ja051bWJlciI6IjB4MThkNzhjZCIsImJsb2NrVGltZXN0YW1wIjoiMjAyNi0wOS0yNFQxNzoxMDo1OS4wMDBaIiwicmVzdWx0cyI6W3siY29uZGl0aW9uIjowLCJsYWJlbCI6IlVTREMgPj0gMSIsInR5cGUiOiJ0b2tlbl9iYWxhbmNlIiwiY2hhaW5JZCI6MSwibWV0Ijp0cnVlLCJldmFsdWF0ZWRDb25kaXRpb24iOnsidHlwZSI6InRva2VuX2JhbGFuY2UiLCJjaGFpbklkIjoxLCJjb250cmFjdEFkZHJlc3MiOiIweEEwYjg2OTkxYzYyMThiMzZjMWQxOUQ0YTJlOUViMGNFMzYwNmVCNDgiLCJvcGVyYXRvciI6Imd0ZSIsInRocmVzaG9sZCI6MSwiZGVjaW1hbHMiOjZ9LCJjb25kaXRpb25IYXNoIjoiMHhjOTM4YjcxYWM3OGRmNTg0M2Q2ODIzZGQ3OGVlMGE1YjY0ZGQ1NmZhODUwOTg0ZTk1NGRkMDcwMjg1MTY5NDQ0IiwiYmxvY2tOdW1iZXIiOiIweDE4ZDc4Y2QiLCJibG9ja1RpbWVzdGFtcCI6IjIwMjYtMDktMjRUMTc6MTA6NTkuMDAwWiJ9XSwiaXNzIjoiaHR0cHM6Ly9hcGkuaW5zdW1lcm1vZGVsLmNvbSIsInN1YiI6IjB4ZDhkQTZCRjI2OTY0YUY5RDdlRWQ5ZTAzRTUzNDE1RDM3YUE5NjA0NSIsImp0aSI6IkFUU1QtNURDQzg1RTc3MjY4N0UwQSIsImlhdCI6MTc5MDI2OTg2OSwiZXhwIjoxNzkwMjcxNjY5fQ.JU4KwRAFl6VRJuZj6OY5jwJB2UUPd7K9t0FBN0atCT_NxIizVY9U0YfyxTCZR0iA1CirbLLijRM2WdBBREnktA";
    string constant ERA_V2_JWT =
        "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Imluc3VtZXItYXR0ZXN0LXYyIn0.eyJwYXNzIjp0cnVlLCJjb25kaXRpb25IYXNoIjpbIjB4NzQ2MTgyNjYzOGEyMzg2MjA1OWRhOTQ3NGZhMTIwNTQ4MjlmNjk0MDIwNzAxNDkxZDY2MDM5NWI4N2RmNjEzMiJdLCJibG9ja051bWJlciI6IjB4MThkNzhjZSIsImJsb2NrVGltZXN0YW1wIjoiMjAyNi0wOS0yNFQxNzoxMToxMS4wMDBaIiwicmVzdWx0cyI6W3siY29uZGl0aW9uIjowLCJsYWJlbCI6IlVTREMgPj0gMSIsInR5cGUiOiJ0b2tlbl9iYWxhbmNlIiwiY2hhaW5JZCI6MSwibWV0Ijp0cnVlLCJldmFsdWF0ZWRDb25kaXRpb24iOnsidHlwZSI6InRva2VuX2JhbGFuY2UiLCJjaGFpbklkIjoxLCJjb250cmFjdEFkZHJlc3MiOiIweEEwYjg2OTkxYzYyMThiMzZjMWQxOUQ0YTJlOUViMGNFMzYwNmVCNDgiLCJvcGVyYXRvciI6Imd0ZSIsInRocmVzaG9sZCI6IjEifSwiY29uZGl0aW9uSGFzaCI6IjB4NzQ2MTgyNjYzOGEyMzg2MjA1OWRhOTQ3NGZhMTIwNTQ4MjlmNjk0MDIwNzAxNDkxZDY2MDM5NWI4N2RmNjEzMiIsImJsb2NrTnVtYmVyIjoiMHgxOGQ3OGNlIiwiYmxvY2tUaW1lc3RhbXAiOiIyMDI2LTA5LTI0VDE3OjExOjExLjAwMFoifV0sImlzcyI6Imh0dHBzOi8vYXBpLmluc3VtZXJtb2RlbC5jb20iLCJzdWIiOiIweGQ4ZEE2QkYyNjk2NGFGOUQ3ZUVkOWUwM0U1MzQxNUQzN2FBOTYwNDUiLCJqdGkiOiJBVFNULTM2RjMzMUMyMzUwMjA1MUYiLCJpYXQiOjE3OTAyNjk4NzcsImV4cCI6MTc5MDI3MTY3N30.557wKKTsLMm6NjcWN3ULooch64pm1EGSUc1JvY9PVjb65FxnR0mwLmyRuStq3IS875a6pWamFpPFZNhJUbwzSQ";
    bytes32 constant ERA_V1_CONDITION = 0xc938b71ac78df5843d6823dd78ee0a5b64dd56fa850984e954dd070285169444;
    bytes32 constant ERA_V2_CONDITION = 0x7461826638a23862059da9474fa12054829f694020701491d660395b87df6132;

    function test_KeyEras_EachGrantsUnderItsOwnPin() public {
        InsumerAccessPredicate v1Pin = new InsumerAccessPredicate(PUB_KEY_X, PUB_KEY_Y, ERA_V1_CONDITION, JWKS_URI);
        InsumerAccessPredicate v2Pin = new InsumerAccessPredicate(PUB_KEY_X, PUB_KEY_Y, ERA_V2_CONDITION, JWKS_URI);
        vm.warp(1790269877 + 60);
        assertTrue(v1Pin.hasAccess(0, LIVE_WALLET, bytes(ERA_V1_JWT)), "v1 token under v1 pin");
        assertTrue(v2Pin.hasAccess(0, LIVE_WALLET, bytes(ERA_V2_JWT)), "v2 token under v2 pin");
        assertFalse(v1Pin.hasAccess(0, LIVE_WALLET, bytes(ERA_V2_JWT)), "v2 token under v1 pin");
        assertFalse(v2Pin.hasAccess(0, LIVE_WALLET, bytes(ERA_V1_JWT)), "v1 token under v2 pin");
    }

    // ──────────────────────────────────────────────
    // Other messages the pinned key signs
    // ──────────────────────────────────────────────

    function _p256(bytes32 h, bytes memory sig) internal view returns (bool) {
        (bool ok, bytes memory ret) = address(0x0100).staticcall(abi.encodePacked(h, sig, PUB_KEY_X, PUB_KEY_Y));
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }

    /// @dev The signatures below are genuine, so the denials after are not vacuous.
    function test_RealKey_OtherSignaturesAreGenuine() public view {
        assertTrue(_p256(sha256(REAL_V2_PREIMAGE), REAL_V2_SIG));
        assertTrue(_p256(sha256(REAL_V1_PREIMAGE), REAL_V1_SIG));
        assertTrue(_p256(sha256(bytes(BINDING_PREIMAGE)), BINDING_SIG));
    }

    function test_RealKey_V2AttestationSignatureDenied() public view {
        assertFalse(live.hasAccess(0, LIVE_WALLET, abi.encodePacked(REAL_V2_PREIMAGE, ".", _b64(REAL_V2_SIG))));
    }

    function test_RealKey_V1AttestationSignatureDenied() public view {
        assertFalse(live.hasAccess(0, LIVE_WALLET, abi.encodePacked(REAL_V1_PREIMAGE, ".", _b64(REAL_V1_SIG))));
    }

    function test_RealKey_KeyBindingSignatureDenied() public view {
        bytes memory d = abi.encodePacked(bytes(BINDING_PREIMAGE), ".", _b64(BINDING_SIG));
        assertFalse(live.hasAccess(0, LIVE_WALLET, d));
        assertFalse(live.hasAccess(0, address(0), d));
    }

    // ──────────────────────────────────────────────
    // Encoding, expiry, second token, precompile
    // ──────────────────────────────────────────────

    /// @dev The signature segment's final character carries 4 unused bits;
    ///      only the spelling with those bits zero is accepted.
    function test_Live_NonCanonicalSignatureCharDenied() public view {
        bytes memory t = bytes(LIVE_JWT);
        assertEq(t[t.length - 1], bytes1("Q"));
        t[t.length - 1] = "R";
        assertFalse(live.hasAccess(0, LIVE_WALLET, t));
    }

    /// @dev Documented behaviour: the high-s twin of a genuine signature also
    ///      verifies (the issuer does not normalise s). Replay tracking keys
    ///      on `jti`, not token bytes.
    function test_Live_HighSTwinVerifies() public view {
        bytes memory t = bytes(LIVE_JWT);
        uint256 dot2 = t.length - 87;
        bytes memory signingInput = new bytes(dot2);
        for (uint256 i = 0; i < dot2; i++) signingInput[i] = t[i];
        bytes32 r = 0xcce1e63702ee8d8c9f096377f727375c5528e85b10a301fc92e623296bf68083;
        bytes32 s0 = 0x18b0953f2851d0fbe4ba0a0dea2c4ff0f810b7554e8f0580218160e970d12c55;
        // (r, s0) is exactly this token's signature.
        assertEq(abi.encodePacked(signingInput, ".", _b64(abi.encodePacked(r, s0))), t);
        uint256 n = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
        bytes memory twin = abi.encodePacked(signingInput, ".", _b64(abi.encodePacked(r, bytes32(n - uint256(s0)))));
        assertTrue(live.hasAccess(0, LIVE_WALLET, twin));
    }

    function test_Live_ExpBoundary() public {
        vm.warp(LIVE_EXP - 1);
        assertTrue(live.hasAccess(0, LIVE_WALLET, bytes(LIVE_JWT)));
        vm.warp(LIVE_EXP);
        assertFalse(live.hasAccess(0, LIVE_WALLET, bytes(LIVE_JWT)));
    }

    function test_Live_SecondRealToken() public {
        vm.warp(1788306572 + 60);
        assertTrue(live.hasAccess(0, LIVE_WALLET, bytes(LIVE_JWT_17)));
    }

    function test_UppercaseConditionHashDenied() public view {
        string memory upper = '["0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]';
        InsumerAccessPredicate p = InsumerAccessPredicate(address(crafted));
        assertFalse(p.hasAccess(0, HOLDER, _token(_payload(_holder(), "true", upper, LIVE_EXP))));
    }

    /// @dev Without the P256VERIFY precompile the call returns no data and
    ///      every token is denied.
    function test_NoPrecompileDenies() public {
        vm.mockCall(address(0x0100), bytes(""), bytes(""));
        assertFalse(live.hasAccess(0, LIVE_WALLET, bytes(LIVE_JWT)));
    }

    // ──────────────────────────────────────────────
    // Never reverts; gas
    // ──────────────────────────────────────────────

    function _repeat(bytes1 c, uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i = 0; i < n; i++) b[i] = c;
        return string(b);
    }

    function testFuzz_NeverRevertsOnRandomData(bytes calldata data, address a) public view {
        try live.hasAccess(0, a, data) returns (bool) {} catch { revert("hasAccess reverted"); }
    }

    function testFuzz_NeverRevertsOnMutatedToken(uint256 pos, uint8 b, uint256 cut) public view {
        bytes memory t = bytes(LIVE_JWT);
        pos = bound(pos, 0, t.length - 1);
        t[pos] = bytes1(b);
        cut = bound(cut, 0, t.length);
        bytes memory u = new bytes(cut);
        for (uint256 i = 0; i < cut; i++) u[i] = t[i];
        try live.hasAccess(0, LIVE_WALLET, u) returns (bool) {} catch { revert("hasAccess reverted"); }
    }

    /// @dev Signed payloads of every length up to 420, near both decode windows.
    function test_ShortSignedPayloadsNeverRevert() public view {
        for (uint256 n = 0; n < 420; n++) {
            bytes memory t = _signRaw(abi.encodePacked(_b64(bytes(HEADER)), ".", _repeat("e", n)));
            try crafted.hasAccess(0, HOLDER, t) returns (bool ok) { assertFalse(ok); } catch { revert("hasAccess reverted"); }
        }
    }

    /// @dev Malformed input never exhausts the reference registry's
    ///      200,000-gas call: a 64 KB body with no dot, a 64 KB body with an
    ///      early dot, and a 64 KB header all come back as a clean denial.
    function test_MalformedInputDeniedInsideGasCap() public view {
        bytes[3] memory inputs;
        bytes memory noDot = new bytes(65000);
        for (uint256 i = 0; i < noDot.length; i++) noDot[i] = "A";
        inputs[0] = noDot;
        bytes memory earlyDot = new bytes(65000);
        for (uint256 i = 0; i < earlyDot.length; i++) earlyDot[i] = "A";
        earlyDot[72] = ".";
        earlyDot[65000 - 87] = ".";
        inputs[1] = earlyDot;
        bytes memory lateDot = new bytes(65000);
        for (uint256 i = 0; i < lateDot.length; i++) lateDot[i] = "A";
        lateDot[64000] = ".";
        lateDot[65000 - 87] = ".";
        inputs[2] = lateDot;
        for (uint256 k = 0; k < 3; k++) {
            (bool ok, bytes memory ret) = address(live).staticcall{gas: 200_000}(
                abi.encodeCall(IAccessPredicate.hasAccess, (0, LIVE_WALLET, inputs[k]))
            );
            assertTrue(ok, "must not run out of gas");
            assertFalse(abi.decode(ret, (bool)));
        }
    }

    /// @dev A token carrying about 18 KB of proof data still fits the
    ///      reference registry's 200,000-gas call.
    function test_ProofSizedTokenUnderGasCap() public view {
        string memory p = string.concat(
            '{"pass":true,"conditionHash":', _cond(), ',"results":[{"proof":"', _repeat("f", 18_000), '"}]',
            ',"sub":"', _holder(), '","exp":', vm.toString(LIVE_EXP), "}"
        );
        (bool ok, bytes memory ret) = address(crafted).staticcall{gas: 200_000}(
            abi.encodeCall(IAccessPredicate.hasAccess, (0, HOLDER, _token(p)))
        );
        assertTrue(ok && abi.decode(ret, (bool)));
    }

    // ──────────────────────────────────────────────
    // getRequirements / ERC-165 / name
    // ──────────────────────────────────────────────

    function test_GetRequirements_Shape() public view {
        (AccessRequirement[] memory reqs, RequirementLogic logic) = live.getRequirements(0);
        assertEq(reqs.length, 1);
        assertEq(reqs[0].kind, type(IWalletStateAttestation).interfaceId);
        (string memory uri, bytes32 cond) = abi.decode(reqs[0].data, (string, bytes32));
        assertEq(uri, JWKS_URI);
        assertEq(cond, LIVE_CONDITION_HASH, "advertises the API's own conditionHash");
        assertEq(uint8(logic), uint8(RequirementLogic.AND));
    }

    function test_WalletStateAttestation_SelectorPinned() public pure {
        assertEq(type(IWalletStateAttestation).interfaceId, bytes4(0x7a111640));
    }

    function test_SupportsInterface() public view {
        assertTrue(live.supportsInterface(type(IAccessPredicate).interfaceId));
        assertTrue(live.supportsInterface(type(IERC165).interfaceId));
        assertFalse(live.supportsInterface(0xdeadbeef));
    }

    function test_Name() public view {
        assertEq(live.name(), "InsumerAccessPredicate");
    }
}
