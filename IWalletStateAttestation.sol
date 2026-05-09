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
///      Verified non-colliding with the three pinned `IRequirementTypes`
///      markers in ERC-8257 (`IERC721Holding 0xbdf8c428`,
///      `IERC1155Holding 0xcb429230`, `ISubscription 0x44387cc2`).
///
///      Layout for `AccessRequirement.data` (returned from
///      `IAccessPredicate.getRequirements`):
///        `abi.encode(string issuerJWKSURI, bytes32 conditionHash)`
///
///      Layout for `IAccessPredicate.hasAccess` `data` parameter (the proof
///      that satisfies the requirement):
///        `abi.encode(`
///          `bool    pass,           // attestation verdict`
///          `address wallet,         // wallet the attestation was issued for`
///          `bytes32 conditionHash,  // hash of the condition set evaluated`
///          `uint256 blockNumber,    // block at which conditions were evaluated`
///          `bytes32 r,              // ECDSA P-256 signature r component`
///          `bytes32 s,              // ECDSA P-256 signature s component`
///          `bytes32 messageHash     // SHA-256 of the signed payload`
///        `)`
///
///      Distinct from the `AccessProof` pattern sketched in ERC-8257
///      Security Considerations §"Account Parameter Is Advisory". That
///      pattern is requester-self-signed (the wallet signs a challenge
///      to prove it is `account`). This pattern is issuer-signed (an
///      external attestation service signs a verdict about `account`'s
///      wallet state), and is the natural shape for cross-chain wallet-
///      state checks that cannot be expressed as a native EVM predicate.
interface IWalletStateAttestation {
    function walletStateAttestation() external;
}
