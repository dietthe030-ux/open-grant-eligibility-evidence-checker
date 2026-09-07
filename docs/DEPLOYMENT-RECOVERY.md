# Deployment and recovery manifest

## PRE_DEPLOY draft

- Classification: `UPGRADABLE` because this already-public adjudication product has required post-deployment contract repairs and needs a bounded code-replacement recovery path.
- Intended network: GenLayer Studionet.
- Chain ID: `61999` (`0xf22f`).
- RPC: `https://studio.genlayer.com/api`.
- Constructor arguments: none (`[]`).
- Intended deployer, owner, initially authorized publisher and sole upgrader: `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902`.
- Linked contracts/configuration: none.
- Logic-adaptation revision: `71e5006864ab144777585306efed335d10096591`.
- Exact source-bearing byte-identity revision: `615c5cfd69e98814e50861144d2660815b07293`.
- Contract source SHA-256: `6571F8FC3329878F82310FC5C3D9395F1A6213430ECB4F97EB4291060D559444` (tracked CRLF bytes; `.gitattributes` locks `-text -diff`).
- Final PRE_DEPLOY package/HEAD is the manifest-only commit immediately following the exact byte-identity revision `615c5cfd69e98814e50861144d2660815b07293`; the exact reviewed HEAD is bound in the private PRE_DEPLOY package.

The constructor stores the actual deployment sender as `owner` and `upgrader`, authorizes it as the first publisher, and appends it to `gl.storage.Root.get().upgraders`. `upgrade(new_code: bytes)` additionally rejects any sender other than the recorded upgrader before replacing Root code. Storage fields are append-only for this repair; future upgrades must preserve field order/types or provide a separately reviewed migration.

## Recovery limits and procedure

Access to the selected Studio account and continued Studionet state are prerequisites; this document does not claim recovery beyond them.

- If Studio/local UI data resets but chain state and the recorded account remain: reconnect that account in Codex's in-app Browser, import the contract by recorded address, load exact source from the recorded public commit, verify source and identity readbacks, then use the reviewed upgrade path only if needed.
- If the recorded account becomes unavailable: the old contract may remain readable but cannot be claimed recoverable. Deploy a replacement from the recorded source/constructor manifest, rerun the full live matrix, update the frontend address and public evidence.
- If Studionet state resets: redeploy from the recorded revision, restore the specification registry through fresh authorized writes, rerun live tests, and update all address-dependent documentation and release configuration.
- Never place private keys, seed phrases, wallet secrets or credentials in this repository.

After deployment this manifest must record the actual contract address, Explorer link, deployment hash, exact public commit, deployed-source SHA-256, final upgrader readback and every configuration transaction.
