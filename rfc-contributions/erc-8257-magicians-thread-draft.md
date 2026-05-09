# Draft: ERC-8257 magicians-thread reply

**Target:** https://ethereum-magicians.org/t/erc-8257-agent-tool-registry/28457
**Status:** Ready to paste. Reference impl pinned at commit `c8f8c73`.
**Author:** Douglas Borthwick (douglasborthwick-crypto)

---

## Pre-post checklist

- [x] Cross-instance verification pass against PR #1723 spec text + `InsumerAccessPredicate.sol`
- [x] Confirm selector `0x7a111640` for `walletStateAttestation()` — verified via `cast sig`, no collision with the three pinned `IRequirementTypes` markers (`0xbdf8c428`, `0xcb429230`, `0x44387cc2`)
- [x] Confirm `InsumerAccessPredicate.sol` compiles and `type(IAccessPredicate).interfaceId` (`0xbdf9dc18`) matches the spec's pinned ID at line 965
- [x] 16/16 Foundry tests pass — happy path runs real ECDSA P-256 verification of a live attestation through RIP-7212; eight failure modes covered
- [x] No customer/integration names anywhere in the post
- [x] Output noun is "attestation," never "credential" or "trust score"
- [x] Collegial register
- [x] RIP-7212 P256VERIFY gas cost (3,450) confirmed against canonical RIP text

---

## Draft post

> Thanks for opening this. Quick comment on item 2 (predicate ERC-165 dispatch + composability): the existing pinned `IRequirementTypes` markers (`IERC721Holding`, `IERC1155Holding`, `ISubscription`) cleanly cover on-chain holdings — same EVM chain as the registry, single Solidity read. There's a fourth shape that the `data` parameter on `IAccessPredicate.hasAccess` already supports natively but no marker yet describes: **off-chain-signed wallet-state attestations**.
>
> The case for it as a distinct `kind`:
>
> 1. **Cross-chain wallet state cannot be expressed as a native EVM predicate.** Wallet state on non-EVM chains (Solana, XRPL, Bitcoin) can't be evaluated from a Solidity predicate. The natural shape is for an off-chain issuer to evaluate the condition set against the relevant chain data, sign a verdict, and have the on-chain predicate verify the signature. The spec's `data` parameter ("Opaque context bytes (e.g., tokenId, proof, **signature**)") is designed for exactly this.
>
> 2. **It's distinct from the `AccessProof` pattern in §"Account Parameter Is Advisory."** That pattern is requester-self-signed — the wallet signs a challenge to prove it is `account`. The attestation pattern here is issuer-signed — an external service signs a verdict about `account`'s wallet state. Identity-binding and state-binding are orthogonal; a complete access scheme may want both, and conflating them at the marker layer would lose that distinction.
>
> 3. **Gas fits comfortably.** ECDSA P-256 verification via the RIP-7212 precompile is ~3,450 gas; ABI decode of a seven-tuple proof is another few thousand. Well under the 200k cap.
>
> Concrete proposal:
>
> ```solidity
> /// @dev kind for off-chain-signed wallet-state attestation requirements.
> ///      data = abi.encode(string issuerJWKSURI, bytes32 conditionHash)
> ///      interfaceId = 0x7a111640
> interface IWalletStateAttestation {
>     function walletStateAttestation() external;
> }
> ```
>
> Selector `0x7a111640 = bytes4(keccak256("walletStateAttestation()"))`, verified non-colliding with the three pinned IDs.
>
> The `getRequirements.data` layout `abi.encode(string issuerJWKSURI, bytes32 conditionHash)` tells an agent two things: where to fetch the issuer's public-key set (a JWKS document at a well-known URL — same trust-anchor pattern as the spec's manifest origin-binding), and which condition set the predicate enforces. The `hasAccess.data` payload then carries the proof itself: `abi.encode(bool pass, address wallet, bytes32 conditionHash, uint256 blockNumber, bytes32 r, bytes32 s, bytes32 messageHash)`.
>
> A working reference predicate that matches this layout, verifies P-256 via RIP-7212, advertises `IAccessPredicate` + `IERC165` for registration validation, and returns `false` (rather than reverts) on any check failure is at:
>
> https://github.com/douglasborthwick-crypto/insumer-examples/blob/c8f8c73/InsumerAccessPredicate.sol
>
> Tests in the same repo (`InsumerAccessPredicate.t.sol`) include a happy-path case that runs real ECDSA P-256 verification of a live signed attestation through the precompile, plus eight failure modes (tampered signature, tampered message hash, wrong account, wrong condition hash, `pass=false`, stale, future-dated, empty data).
>
> Happy to fold the marker into a PR against `IRequirementTypes.sol` if it's useful, or leave it as a third-party marker per the spec's extension guidance — whichever fits the cadence you're running.

---

## Notes for cross-instance review

The post claims four things that need verification before posting:

1. **Selector `0x7a111640` is non-colliding.** Verified locally against the three pinned IDs. Cross-instance should re-compute and re-check.
2. **The spec's `data` parameter explicitly lists "signature" as a valid use.** Source: ERC-8257 §1 `IToolRegistry.hasAccess` docstring — "Opaque context bytes forwarded to the predicate (e.g., a tokenId, a Merkle proof, a signature)."
3. **§"Account Parameter Is Advisory" introduces the `AccessProof` pattern as requester-self-signed.** Source: ERC-8257 Security Considerations §"Account Parameter Is Advisory" / §"Concrete AccessProof Pattern" — the principal signs a challenge with their private key; the predicate recovers and matches against `account`.
4. **RIP-7212 P256VERIFY costs ~3,450 gas.** Pulled from RIP-7212 spec; cross-instance should confirm against the canonical RIP text rather than memory.

## What's deliberately NOT in the post

- No mention of any specific InsumerAPI customer or integration.
- No mention of "33 chains," "production system," "live with X" — primitive observation only.
- No mention of x402 / x402scout / ERC-8004 / agent payments. The post stays in the ERC-8257 lane.
- No DM-pre-warm framing. Post stands on its own.
- No request for a call. Async only — "drop notes here whenever."
- No closing line claiming a stage. Just the contribution.
