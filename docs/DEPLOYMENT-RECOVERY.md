# Deployment and recovery manifest

## Studio Next deployment — accepted receipt, live E2E complete

- Classification: `UPGRADABLE`; this is a replacement deployment for the repaired authority model.
- Intended network: GenLayer Studio Devnet (Studio Next).
- Chain ID: `61997` (`0xf22d`).
- RPC: `https://studio-dev.genlayer.com/api`.
- Explorer: `https://explorer-studio-dev.genlayer.com/`.
- SDK/CLI aliases: `studioDevnet` / `studio-dev`.
- Constructor arguments: none (`[]`); the corrected CLI invocation omitted the `--args` flag so no positional constructor value was encoded.
- Intended deployer, owner, initially authorized publisher and sole upgrader: actor7, public address `0x8581c4a532dd3f9b163b12809b1bd089f367147f`.
- Linked contracts/configuration: none.
- Logic-adaptation base: `71e5006864ab144777585306efed335d10096591`; the current runtime-adapter candidate revision, exact source hash and package hash are bound in `private/resubmission/PRE-DEPLOY-VERIFICATION.md`.
- Contract source SHA-256: `01FC51D2C56DBECEE2AB6283189A7AAB9E92461FCA90DFC256D82E6BFCA6D615`; 21,592 tracked CRLF bytes (with `.gitattributes` locking `-text -diff`).
- Exact deployed revision: `c4237251f7817860de88dab9fc5d9d82a348c89e`.
- Deployed contract address: `0x7f8fB07F756125e60c114C61A55963eD454301a9`.
- Deployment transaction: `0xa019e5555f39e1f658787af50135810d3002811a5655dcbc3cf8bf253204a634`.
- Deployment Explorer: `https://explorer-studio-dev.genlayer.com/address/0x7f8fB07F756125e60c114C61A55963eD454301a9`.
- Deployment operation: `ogec-studiodev-c423725-deploy-02`.
- Independently read receipt: `FINALIZED`, `MAJORITY_AGREE`, `FINISHED_WITH_RETURN`, leader `SUCCESS/return`, sender/origin actor7, 5/5 votes revealed.
- Deployed source readback: 21,592 bytes; SHA-256 `01FC51D2C56DBECEE2AB6283189A7AAB9E92461FCA90DFC256D82E6BFCA6D615`; exact match with the local candidate source.
- Identity readbacks: `get_owner` = actor7; `get_upgrader` = actor7; `is_authorized_publisher(actor7)` = `true`.
- Configuration transactions: none; no linked contracts.
- A first deployment attempt is retained as diagnostic only in `private/resubmission/studio-deploy-attempt-01-failure-c423725.json`; it finalized with `FINISHED_WITH_ERROR` because `--args []` encoded an unintended constructor argument. Its hash is not a deployment success and was not resubmitted.
- The complete live Studio matrix S0–S11 is recorded in `private/resubmission/STUDIO-DEPLOYMENT-LEDGER.md` and the per-case evidence files. Completion timestamp: `2026-09-20T17:35:58+07:00`. The exact POST_DEPLOY package and its hash bind the review request; anonymous approval is still a separate checkpoint decision.

The constructor stores the actual deployment sender as `owner` and `upgrader`, authorizes it as the first publisher, and appends it to `gl.storage.Root.get().upgraders`. `upgrade(new_code: bytes)` rejects any sender other than the recorded upgrader before replacing Root code. Storage fields are append-only for this repair; future upgrades must preserve field order/types or provide a separately reviewed migration.

## Recovery limits and procedure

Access to the selected Studio Next account and continued chain state are prerequisites; this document does not claim recovery beyond them.

- If Studio/local UI data resets but chain state and the recorded account remain: use the official CLI wrapper with preset `studio-dev`, import the contract by the recorded address once it exists, load the exact reviewed source, and verify source and identity readbacks before any reviewed upgrade.
- If the recorded account becomes unavailable: a deployed contract may remain readable but cannot be claimed recoverable. Deploy a replacement from the recorded source/constructor manifest, rerun the full live matrix, update the frontend address and public evidence.
- If Studio Next state resets: do not reuse the historical 61999 address or hashes. Re-run the current PRE_DEPLOY review, deploy once with one stable operation ID, and update all address-dependent documentation and release configuration.
- Never place private keys, seed phrases, wallet secrets or credentials in this repository.

## Historical invalidation

The former Studionet target (`61999`, RPC `https://studio.genlayer.com/api`, Explorer `https://explorer-studio.genlayer.com/`) and its account/address/receipt evidence are retained only as historical diagnostics. They are not the current network, account, deployment, recovery plan or approval basis for Studio Next. No 61999 deployment or write is resumed on 61997.

The current deployment facts above are the recovery anchor. Any source/configuration change invalidates dependent live evidence and requires a new exact-source deployment or approved upgrade.
