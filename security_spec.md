# AERIS AI Firestore Security Specification

## 1. Data Invariants
1. **Opt-In Anonymity & Zero PII**: `community_contributions` and `challenge_participants` never store emails, phone numbers, precise coordinates, or medical diagnoses. Only an `anonymousHandle` and city name are stored alongside `authorUid` / `userId`.
2. **Identity Integrity**: On creation, `authorUid` (or `userId`) MUST match `request.auth.uid` and the user must have a verified email (`request.auth.token.email_verified == true`).
3. **Explicit Opt-In Enforcement**: List queries and public reads on `community_contributions` only expose records where `resource.data.optInPublic == true`.
4. **Temporal, City & Numeric Bounds**: `createdAt` / `joinedAt` must equal `request.time`. `city` is strictly letters and spaces (`^[a-zA-Z ]+$`, 2–60 chars). `co2AvoidedKg` must equal `0` for qualitative-only actions (`no_burning`, `hepa_maintenance`) and be strictly `> 0` and `<= 500` for quantified actions. All string fields have strict `.size()` caps.
5. **Immutable Contributions**: Community contributions cannot be altered after creation to falsify totals; only the original author can delete their own entry.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Write**: Create `community_contributions/c1` with `request.auth == null`.
2. **Unverified Email Write**: Create `community_contributions/c2` with `email_verified: false`.
3. **Identity Spoofing**: Create `community_contributions/c3` with `authorUid: "victim_uid"` while signed in as `"attacker_uid"`.
4. **Shadow Field Injection**: Create `community_contributions/c4` with valid fields plus extra key `isAdminVerified: true`.
5. **Client Timestamp Forgery**: Create `community_contributions/c5` with `createdAt: "2020-01-01T00:00:00Z"` instead of server `request.time`.
6. **Negative / Infinite CO2e Poisoning**: Create `community_contributions/c6` with `co2AvoidedKg: 999999` or `-5`.
7. **ID Poisoning**: Create document with 1.5KB junk document ID or invalid characters `../admin`.
8. **Silent Opt-Out Leak**: Create `community_contributions/c7` with `optInPublic: false` or read non-public docs.
9. **Unauthorized Update**: Attempt `update` on someone else's `community_contributions` document.
10. **Non-Admin Challenge Tampering**: Regular signed-in user attempts to create/update `community_challenges/fake`.
11. **Oversized Note Exhaustion**: Create `community_contributions/c8` with 10,000-char `note`.
12. **Cross-User Enrollment Delete**: Delete another user's `challenge_participants` record.
