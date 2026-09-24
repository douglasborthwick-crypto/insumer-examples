// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IWalletStateAttestation
/// @notice Marker interface whose `interfaceId` serves as the
///         `AccessRequirement.kind` field in ERC-8257 `IAccessPredicate`
///         implementations that gate on off-chain-signed wallet-state
///         attestations.
///
/// @dev `interfaceId = bytes4(keccak256("walletStateAttestation()")) = 0x7a111640`
///
///      Verified non-colliding with the three markers pinned in ERC-8257
///      (`IERC721Holding 0xbdf8c428`, `IERC1155Holding 0xcb429230`,
///      `ISubscription 0x44387cc2`) and with the further markers in the
///      ERC-8257 reference implementation.
///
///      Layout for `AccessRequirement.data` (returned from
///      `IAccessPredicate.getRequirements`):
///        `abi.encode(string issuerJWKSURI, bytes32 conditionHash)`
///      where `conditionHash` is the 32-byte SHA-256 condition hash exactly
///      as the issuer reports it, so an agent can match it against the
///      issuer's own value.
///
///      Layout for `IAccessPredicate.hasAccess` `data` parameter (the proof
///      that satisfies the requirement): the issuer's compact JWT, as ASCII
///      bytes, unchanged:
///        `base64url(header) "." base64url(payload) "." base64url(signature)`
///      The predicate verifies the signature and reads the wallet, verdict,
///      condition hash and expiry from the signed payload.
///
///      Distinct from the AccessProof pattern sketched in ERC-8257
///      Security Considerations §"Account Parameter Is Advisory". That
///      pattern is requester-self-signed (the wallet signs a challenge
///      to prove it is `account`). This pattern is issuer-signed (an
///      external attestation service signs a verdict about `account`'s
///      wallet state), and is the natural shape for wallet-state checks
///      on chains other than the one the registry is deployed on.
interface IWalletStateAttestation {
    function walletStateAttestation() external;
}
