# Deployment and recovery manifest

## PRE_DEPLOY draft

- Classification: `UPGRADABLE` because this already-public adjudication product has required post-deployment contract repairs and needs a bounded code-replacement recovery path.
- Intended network: GenLayer Studionet.
- Chain ID: `61999` (`0xf22f`).
- RPC: `https://studio.genlayer.com/api`.
- Constructor arguments: none (`[]`).
- Intended deployer, owner, initially authorized publisher and sole upgrader: `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902`.
- Linked contracts/configuration: none.
- Exact source-bearing revision: `7844daf4eeae6bfad90ce2588b3d7fc72b4c71e3`.
- Contract source SHA-256: `D89F09D2791E5AD2FB415F89680BD56CFC30308B0105181C1E3AAD787A9D84A2`.
- Final PRE_DEPLOY package/HEAD: recorded after this tracked manifest correction; the source-bearing revision above remains exact because the subsequent commit changes documentation only.

The constructor stores the actual deployment sender as `owner` and `upgrader`, authorizes it as the first publisher, and appends it to `gl.storage.Root.get().upgraders`. `upgrade(new_code: bytes)` additionally rejects any sender other than the recorded upgrader before replacing Root code. Storage fields are append-only for this repair; future upgrades must preserve field order/types or provide a separately reviewed migration.

## Recovery limits and procedure

Access to the selected Studio account and continued Studionet state are prerequisites; this document does not claim recovery beyond them.

- If Studio/local UI data resets but chain state and the recorded account remain: reconnect that account in Codex's in-app Browser, import the contract by recorded address, load exact source from the recorded public commit, verify source and identity readbacks, then use the reviewed upgrade path only if needed.
- If the recorded account becomes unavailable: the old contract may remain readable but cannot be claimed recoverable. Deploy a replacement from the recorded source/constructor manifest, rerun the full live matrix, update the frontend address and public evidence.
- If Studionet state resets: redeploy from the recorded revision, restore the specification registry through fresh authorized writes, rerun live tests, and update all address-dependent documentation and release configuration.
- Never place private keys, seed phrases, wallet secrets or credentials in this repository.

After deployment this manifest must record the actual contract address, Explorer link, deployment hash, exact public commit, deployed-source SHA-256, final upgrader readback and every configuration transaction.
