# Dreamcadian Casino (DCDN)

The DCDN casino web app: one lobby, one player vault, every game settled on the
server. Built on Base44 (frontend in `src/`, backend in `base44/`).

| Game | Route | Backend function | Source |
|---|---|---|---|
| Neon slots (data-driven, one per `Game` row) | `/play/:id` | `spinSlot` | Base44 app |
| Neon Hold'em (6-seat tables) | `/holdem` | `dealHoldem` + `HoldemLobby` actor | Base44 app |
| Back Room Blackjack | `/blackjack` | `playBlackjack` | ported from the AI Studio app, rebuilt server-side |
| Wheel of the Don (European roulette) | `/roulette` | `spinRoulette` | ported from the AI Studio app, rebuilt server-side |
| Slot Lounge (6 themed slots) | [slot-lounge.onrender.com](https://slot-lounge.onrender.com/) (linked in the header) | its own Node server | separate app: [ZeroCoolrules/slot-lounge](https://github.com/ZeroCoolrules/slot-lounge), own accounts and wallet |

## How money moves

1. **Deposit once.** The player sends DCDN to the house wallet from MetaMask;
   `verifyDeposit` reads the receipt over RPC, checks the player signed for the
   sending address, and credits their off-chain vault (`Wallet` entity).
2. **Play off-chain.** Every bet, win and loss is a balance change in the vault,
   applied with a compare-and-swap (`base44/shared/walletSettle.ts`) so parallel
   requests can't double-spend. No gas, no 1% burn per bet.
3. **Withdraw once** (not built yet — see "Before real money").

The browser never decides an outcome. All games use server seeds and a
provably-fair HMAC stream (`base44/shared/fairRng.ts`); blackjack commits to
`sha256(server_seed)` at the deal and reveals the seed when the hand ends.

## DCDN on Base Sepolia

Set these as Base44 app secrets (never commit them):

| Secret | Value |
|---|---|
| `QUICKNODE_RPC_URL` | your Base Sepolia RPC URL (chain id 84532) |
| `DCDN_CONTRACT_ADDRESS` | `0x0602074976325a455BA3Fc53fD43294C5a3ABd66` |
| `HOUSE_WALLET_ADDRESS` | the casino's house wallet |

Two DCDN contract rules the casino has to respect:

- **1% burn on every transfer**, taken from the recipient. A 100 DCDN deposit
  leaves 99 in the house wallet, so `parseDepositFromReceipt` credits the
  house's *net* change (99), not the gross Transfer value.
- **1% max wallet (210,000 DCDN).** The house wallet must be exempted by the
  owner Safe: `setExcludedFromLimits(<house wallet>, true)` on the DCDN contract.

## Tests

```bash
npm test               # both suites
npm run test:engines   # game math: roulette EV = 36/37 on every bet, shoe integrity, blackjack RTP sim, deposit burn
npm run test:functions # runs spinRoulette/playBlackjack against an in-memory Base44 mock; checks balances always reconcile
```

## Before real money

- Withdrawals (vault → on-chain) with limits, review and the 1% burn shown to the player.
- Per-player seed commitment for slots/roulette (today the seed is generated and
  revealed per spin; blackjack already commits before play).
- Gambling licence, KYC/AML and geo-blocking. Testnet DCDN has no value.

---

# Base44 Project

Use this repository to run and edit the app locally, then publish changes back through Base44.

Any change pushed to the repo will also be reflected in the Base44 Builder.

## Prerequisites

1. Clone the repository using the project's Git URL.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.
4. Install the Base44 CLI: `npm install -g base44@latest`.
5. Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) — the local Base44 backend runs on it.

Run `base44 --help` (or see the [CLI reference](https://docs.base44.com/developers/references/cli/commands/introduction)) for the full command surface.

## Run Locally

Three commands, from the project root:

```bash
base44 login   # one-time per machine
base44 link    # one-time per clone
base44 dev     # local backend + frontend together
```

Open the frontend URL that `base44 dev` prints (typically `http://localhost:5173`).

Notes:

- **Every fresh clone needs `base44 link`.** It writes `base44/.app.jsonc` (the app-id pointer), which is deliberately gitignored. Your app id is in the Builder URL (`app.base44.com/apps/<id>/...`); `base44 link --help` shows the non-interactive flags.
- **`base44 dev` runs the frontend for you** (via `site.serveCommand` in this repo's `base44/config.jsonc`) — never run `npm run dev` yourself: alone it serves a UI with no backend behind it (`[base44] Proxy not enabled`, every `/api` call fails), and alongside `base44 dev` the second Vite silently takes the next port and you end up looking at the wrong one.
- **The app must be published at least once for the UI to load under `base44 dev`.** The frontend boots by fetching app settings from the hosted app; before the first publish that fails and every page redirects to login. The local API works regardless.
- Entities, functions, and auth run locally — entity data is **in-memory only**, wiped when `base44 dev` restarts. Everything else (Core integrations, OAuth login) is forwarded to your deployed app. Full breakdown: [Local development overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview).

## Frontend Only, Hosted Backend

To work on just the frontend against your app's live hosted backend:

```bash
base44 dev --remote
```

⚠️ In this mode writes go to your app's **production data** — plain `base44 dev` keeps everything local.

## Publish Your Changes

After pushing your changes to git, open the Base44 dashboard and publish the app:

```bash
base44 dashboard open
```

This repo syncs to Base44 through git, so publish from the dashboard rather than `base44 deploy` — a CLI deploy ships your local tree directly, bypassing the sync, and the deployed state silently diverges from the repo.

## Docs & Support

GitHub integration: [https://docs.base44.com/developers/app-code/local-development/github](https://docs.base44.com/developers/app-code/local-development/github)

Local development: [https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview)

Support: [https://app.base44.com/support](https://app.base44.com/support)
