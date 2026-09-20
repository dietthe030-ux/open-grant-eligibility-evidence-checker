# Deployment and recovery manifest

## PRE_DEPLOY draft — Studio Next

- Classification: `UPGRADABLE`; this is a replacement deployment for the repaired authority model.
- Intended network: GenLayer Studio Devnet (Studio Next).
- Chain ID: `61997` (`0xf22d`).
- RPC: `https://studio-dev.genlayer.com/api`.
- Explorer: `https://explorer-studio-dev.genlayer.com/`.
- SDK/CLI aliases: `studioDevnet` / `studio-dev`.
- Constructor arguments: none (`[]`).
- Intended deployer, owner, initially authorized publisher and sole upgrader: actor7, public address `0x8581c4a532dd3f9b163b12809b1bd089f367147f`.
- Linked contracts/configuration: none.
- Logic-adaptation base: `71e5006864ab144777585306efed335d10096591`; the current runtime-adapter candidate revision, exact source hash and package hash are bound in `private/resubmission/PRE-DEPLOY-VERIFICATION.md`.
- Contract source SHA-256: `01FC51D2C56DBECEE2AB6283189A7AAB9E92461FCA90DFC256D82E6BFCA6D615`; 21,592 tracked CRLF bytes (with `.gitattributes` locking `-text -diff`).
- No Studio Next deployment or write has been performed in this migration; `writesSubmitted=0` remains the current state.

The constructor stores the actual deployment sender as `owner` and `upgrader`, authorizes it as the first publisher, and appends it to `gl.storage.Root.get().upgraders`. `upgrade(new_code: bytes)` rejects any sender other than the recorded upgrader before replacing Root code. Storage fields are append-only for this repair; future upgrades must preserve field order/types or provide a separately reviewed migration.

## Recovery limits and procedure

Access to the selected Studio Next account and continued chain state are prerequisites; this document does not claim recovery beyond them.

- If Studio/local UI data resets but chain state and the recorded account remain: use the official CLI wrapper with preset `studio-dev`, import the contract by the recorded address once it exists, load the exact reviewed source, and verify source and identity readbacks before any reviewed upgrade.
- If the recorded account becomes unavailable: a deployed contract may remain readable but cannot be claimed recoverable. Deploy a replacement from the recorded source/constructor manifest, rerun the full live matrix, update the frontend address and public evidence.
- If Studio Next state resets: do not reuse the historical 61999 address or hashes. Re-run the current PRE_DEPLOY review, deploy once with one stable operation ID, and update all address-dependent documentation and release configuration.
- Never place private keys, seed phrases, wallet secrets or credentials in this repository.

## Historical invalidation

The former Studionet target (`61999`, RPC `https://studio.genlayer.com/api`, Explorer `https://explorer-studio.genlayer.com/`) and its account/address/receipt evidence are retained only as historical diagnostics. They are not the current network, account, deployment, recovery plan or approval basis for Studio Next. No 61999 deployment or write is resumed on 61997.

After deployment this manifest must record the actual Studio Next contract address, Explorer link, deployment hash, exact public commit, deployed-source SHA-256, final upgrader readback and every configuration transaction.
