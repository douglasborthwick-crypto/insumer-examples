# Multi-attestation envelope fixtures

Eight envelopes, each paired with the result a correct verifier must produce. They test
**composition**, not a single signature: whether one bad entry changes any other entry's
verdict, and whether the aggregate is reproducible from the per-slot results and the options
the verifier ran under.

The single-attestation vectors in the parent directory answer a different question, whether one
attestation is genuine. These answer what happens when several sit side by side.

```bash
node run.mjs
```

Uses `../../multi-attest-verify.js`, the reference verifier for the payload format in
`MULTI-ATTESTATION-SPEC.md`. Exit 0 only if every fixture matches exactly.

## The fixtures

| # | Fixture | Must produce |
|---|---|---|
| E01 | Two slots, both signatures valid | both verify, aggregate true |
| E02 | E01 with slot 0's signature removed | slot 0 malformed, **slot 1 unchanged** |
| E03 | E01 with slot 0's signature altered | slot 0 signature invalid, **slot 1 unchanged** |
| E04 | Required type that both slots carry | met, `missingRequired` empty |
| E05 | Required type no slot carries | `missingRequired` names it |
| E06 | Same envelope with freshness checked | expired, signature never examined |
| E07 | E01 with slot 0's `kid` not in the JWKS | slot 0 key unresolved, **slot 1 unchanged** |
| E08 | E01 with an unsigned object stapled onto slot 0 beside its valid JWS | slot 0 malformed, **slot 1 unchanged** |

## What each pair is for

**E02 against E03: two failures that must not look alike.** E02 is a classification failure,
an entry missing required fields that never reaches a cryptographic check. E03 is a signature
failure, an entry that is complete and does not verify. A verifier reporting both as one
outcome cannot tell a malformed envelope from a tampered one, and those call for different
responses.

**E08: a valid signature is not a valid entry.** Slot 0's JWS is genuine and verifies. What
is wrong is the object stapled beside it, which no signature covers, claiming a different
attestation id and a threshold a millionfold above the signed one. A verifier that checks the
signature and returns reports `signatureValid: true` with `error: null` over data the attacker
wrote, and a relying party reading claims from `signed` rather than from the JWT consumes it.
The entry is refused at step 0, with the malformed entries, rather than at the signature check:
the defect is in the entry's form, knowable before any key is fetched, and refusing it there
means it is refused whether or not the entry is also stale. This is the one fixture whose
failure mode is acceptance rather than rejection, which is why it exists.

**E01 against E02 and E03: slot independence.** Each entry carries its own `kid`, `jwks` and
signature, and nothing signs the envelope itself. So breaking slot 0 must leave slot 1 exactly
as it was. `run.mjs` asserts this comparatively rather than trusting each fixture's own expected
block: it runs E01 beside every fixture that is E01 with slot 0 altered — E02, E03, E07 and
E08 — and requires slot 1's verdict to be byte-identical across all five. That
comparison is the test. If it ever fails, the envelope has grown a dependency between issuers
that having no envelope-level signature was meant to prevent.

**E04 against E05: the aggregate depends on the options.** Same envelope, same slots, identical
per-slot verdicts. Only the summary moves. The aggregate is a function of the slot results and
the options together, never of the slots alone, which is why every fixture pins the options it
ran under rather than leaving them implied.

**E06: freshness is checked before genuineness, and short-circuits it.** The same envelope as
E01, differing only in that expiry is checked. The verifier marks each entry expired and returns
before the signature is examined, so `signatureValid` reads false on both slots although neither
signature is bad. E01 is the same two entries with freshness off, and both verify there.

The consequence is worth stating because it is the opposite of what the single-attestation
verifier does, which reports four checks independently. Here an expired entry and a forged one
look identical in `signatureValid`, and `error` is the only field separating them: `"Attestation
expired"` rather than a signature failure. A relying party that needs to tell a stale attestation
from a fabricated one has to read `error`, not the boolean. The order errs toward rejection rather than acceptance: a stale entry with a good signature is refused, which is the safe direction for a freshness check to fail in.

## Two things that will look odd and are not

**E01 to E05, E07 and E08 pin `checkExpiry: false`.** Any published fixture is permanently past
its window, so with freshness on, expiry would swamp every other property and six of the eight
would read alike. Switching it off lets the composition properties be seen on their own, and E06
covers the default behaviour deliberately. On E07 that pinning is load-bearing rather than
cosmetic: the freshness short-circuit described above would mask the unresolved key entirely.

The two that read differently with freshness on are E02 and E08, and for the same reason: both
are classified at step 0, which runs before expiry, so they report their own defect rather than
staleness either way. Their pinning is for comparability with the fixtures they are measured
against, not because it changes their verdict. This is the same fact the parent directory's README describes:
an attestation records what was true at a named block and does not decay, while expiry is a
freshness policy for acting on it.

**Both slots are InsumerAPI `wallet_state` attestations.** The envelope format is designed for
several issuers, and a fixture set covering that properly needs entries each issuer signed with
its own key. Those are not something this repository can produce: every issuer signs its own,
which is the property the format exists to preserve. Because both entries here carry the same issuer, JWKS and `kid`, they resolve to the same cached key, so what this set demonstrates is that one slot's verdict does not move another's. An entry signed by a second issuer under a different key would additionally demonstrate that key resolution stays isolated per entry, which is why the invitation below is worth taking up. What is here exercises the composition
rules with the entries it can legitimately sign. A peer wanting their type represented can add
an entry signed by their own key against their own JWKS.

## A note on the entry form

Both slots carry the attestation as a compact JWS, with `signed` set to `null`, which the
specification requires. That is the correct form for a v2 attestation. The raw form verifies a
signature over the JSON of `signed`, and a v2 attestation is signed over a domain-separated
preimage rather than over that object, so it cannot be represented faithfully that way.
