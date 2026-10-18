# Issue da creare — Review Ottobre 2026

**Stato creazione GitHub:** BLOCCATO (vedi §0).  
**Branch report:** `cursor/review-2026-10-c1af`  
**Report:** [`docs/review/2026-10-review.md`](./2026-10-review.md)

---

## 0. Fallimenti di scrittura (errori esatti)

| Operazione | Tool / comando | Errore | Permesso mancante |
|------------|----------------|--------|-------------------|
| Draft PR | `ManagePullRequest` | `Validation Failed: {"resource":"Issue","code":"custom","message":"must be a collaborator"}` | Collaboratore / Pull requests: write |
| Draft PR | `gh pr create` | `GraphQL: Resource not accessible by integration (createPullRequest)` HTTP 403 | GitHub App: Pull requests write |
| Issue | `gh issue create` | `GraphQL: Resource not accessible by integration (createIssue)` HTTP 403 | GitHub App: Issues write |
| Label | `gh label create` | `HTTP 403: Resource not accessible by integration` | GitHub App: Issues write (labels) |
| Repo ACL | `gh api .../collaborators/cursor/permission` | `permission: none`, `push/triage/pull: false` | Installazione App / collaborator Write |

**Nota:** le issue esistenti (#112–#125, #180–#181) sono state create dall’utente umano `LucaGiardi20`, non dal token di questo agent. Push del branch funziona; create PR/issue/label no.

**Projects:** nessun GitHub Project (Projects V2) trovato su `qiick-io`.

**Retry dopo grant:** chiedere all’agent di rieseguire creazione PR + issue da questo file.

---

## 1. Razionale distribuzione milestone

### Milestone esistenti

| Milestone | Scopo (da GitHub) | Cosa ci va da questa review |
|-----------|-------------------|-----------------------------|
| **1.2.0** | Product figate editoriali (kanban, approvals, …) | **Niente di nuovo** — #47 Kanban/Calendar già `COMPLETED` |
| **1.3.0** | Platform hardening: rate limits, AuthZ suite, API key scopes, upload security, N+1 | **Solo hardening già in issue esistenti** + al massimo 1–2 micro-fix security critici non coperti |
| **1.4.0** | Operator scale: workspaces, MCP, field ACL, transforms, deep filters, bulk API | Perf file library, security headers (defense-in-depth), storage adapters |
| **1.5.0** *(da creare)* | AI & media intelligence (post–laravel/ai 1.1) | Classificazione file, moderation gate, feature AI prodotto |

### Principio

> **In 1.3.0 solo fix di sicurezza/hardening critici.** Feature AI, parity Directus non-security, tech-debt di scala → 1.4.0 o 1.5.0.

### Deduplicazione vs issue esistenti

| Proposta report | Decisione | Motivo |
|-----------------|-----------|--------|
| NEW-1 cost-based rate limit | **NON creare** | Coperta da **#113** |
| NEW-2 MIME allowlist + magic bytes | **NON creare** | Coperta da **#118** (ampliare #118 in commento se serve magic bytes) |
| NEW-3 GraphQL depth/complexity | **NON creare** | Coperta da **#113** (“include-depth caps”) |
| NEW-4 `effective_access` denormalize | **Creare → 1.4.0** | Scala operatori, non hardening critico 1.3.0; correlata a #117 ma distinta |
| NEW-5 security headers | **Creare → 1.4.0** | Defense-in-depth, priorità bassa; non blocca 1.3.0 |
| NEW-6 AI file classification | **Creare → 1.5.0** | Dipende da #180; feature prodotto AI, non hardening |
| NEW-7 AI moderation publish | **Creare → 1.5.0** | Feature AI; dopo #180 |
| NEW-8 Kanban/Calendar | **NON creare** | Duplicato di **#47** (CLOSED/COMPLETED, milestone 1.2.0) |
| NEW-9 GCS / Azure Blob | **Creare → 1.4.0** | Operator scale / storage; S3 già c’è |
| NEW-10 Streaming SHA-256 upload | **Creare → 1.4.0** | Tech-debt memoria (`FileService` ponytail) |
| NEW-11 CI `composer audit` + `npm audit` | **Creare → 1.3.0** | Hardening pipeline; unico nuovo item security per 1.3.0 non già in #112–#118 |
| NEW-12 Webhook HMAC `hash_equals` audit | **Creare → 1.3.0** | Micro-fix security critico (timing-safe compare) |

### Mappa finale (da creare)

```
1.3.0  →  NEW-11 (audit CI), NEW-12 (HMAC hash_equals)
1.4.0  →  NEW-4 (effective_access), NEW-5 (security headers), NEW-9 (GCS/Azure), NEW-10 (streaming hash)
1.5.0  →  NEW-6 (AI classify), NEW-7 (AI moderate)   [creare milestone 1.5.0]
SKIP   →  NEW-1, NEW-2, NEW-3, NEW-8
```

**Nessun dump di tutto in 1.3.0.** Feature AI in 1.5.0 perché 1.4.0 è già pieno di operator-scale e AI non è “platform hardening”.

---

## 2. Label da creare (se mancanti)

Esistenti: `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`, `UI`, `area:dx`.

**Da creare:**

| Label | Colore | Uso |
|-------|--------|-----|
| `type:security` | `#B60205` | Security / AuthZ / upload |
| `type:performance` | `#FBCA04` | Perf / N+1 / memory |
| `type:ai` | `#5319E7` | Laravel AI / vision / MCP-adjacent |
| `type:chore` | `#CFD3D7` | CI / deps / ops |
| `area:api` | `#1D76DB` | Public API / GraphQL |
| `area:files` | `#0E8A16` | File manager / storage |
| `area:authz` | `#D93F0B` | Permissions / RBAC |
| `priority:P0` | `#B60205` | Critico |
| `priority:P1` | `#D93F0B` | Alto |
| `priority:P2` | `#FBCA04` | Medio |
| `priority:P3` | `#C2E0C6` | Basso |
| `severity:critical` | `#B60205` | Solo security |
| `severity:high` | `#D93F0B` | |
| `severity:medium` | `#FBCA04` | |
| `severity:low` | `#C2E0C6` | |
| `effort:S` | `#EDEDED` | ≤1 giorno |
| `effort:M` | `#BFD4F2` | 2–3 giorni |
| `effort:L` | `#D4C5F9` | 4–5+ giorni |

---

## 3. Spec issue (agent-ready, italiano)

> Quando l’accesso write è disponibile, creare nell’ordine sotto. Ogni body è autosufficiente per un coding agent.

---

### ISSUE A — NEW-11 · Milestone **1.3.0** · effort:S · priority:P1 · severity:high

**Title:** `ci(security): workflow settimanale composer audit + npm audit`

**Labels:** `type:chore`, `type:security`, `area:dx`, `priority:P1`, `severity:high`, `effort:S`, `enhancement`

**Body:**

```markdown
## Contesto

La review di ottobre 2026 (`docs/review/2026-10-review.md` §1.5) evidenzia che non c’è un job CI periodico per vulnerabilità dipendenze PHP/JS. La milestone **1.3.0** è “platform hardening”: questo è l’unico nuovo issue security di hardening pipeline non già coperto da #112–#118.

## Obiettivo

Aggiungere un workflow GitHub Actions che esegue `composer audit` e `npm audit --audit-level=moderate` su schedule settimanale + su push verso `main`/`develop`, e fallisce la CI se ci sono advisory sopra la soglia.

## Riferimenti file

- Nuovo: `.github/workflows/security-audit.yml`
- Esistenti: `composer.json`, `package.json`, eventuali workflow in `.github/workflows/`

## Passi di implementazione

1. Creare `.github/workflows/security-audit.yml` con:
   - `on.schedule` (es. lunedì 00:00 UTC) e `on.push` su branch principali + `workflow_dispatch`
   - Job Node 24 + PHP 8.4 (allineato a `.nvmrc` / `composer.json`)
   - Step: `composer install --no-interaction` → `composer audit`
   - Step: `npm ci` → `npm audit --audit-level=moderate`
2. Documentare in `SECURITY.md` o docs ops come interpretare i failure.
3. Se `composer audit` non è disponibile nella versione Composer del progetto, usare il comando equivalente documentato e fallire esplicitamente.

## Criteri di accettazione

- [ ] Workflow presente e eseguibile con `workflow_dispatch`
- [ ] Fallisce su advisory moderate+ (npm) / known vuln (composer)
- [ ] Nessun secret hardcoded
- [ ] Documentato dove leggere i risultati

## Note di test

- Eseguire `act` o `workflow_dispatch` su branch di prova.
- Verificare che un advisory fittizio (se possibile in fork) falga il job.

## Fuori scope

- Auto-PR di bump dipendenze (Dependabot/Renovate).
- Fix delle vulnerabilità trovate (issue separate).

## Related

- Milestone 1.3.0 hardening
- Report: `docs/review/2026-10-review.md` §1.5
```

---

### ISSUE B — NEW-12 · Milestone **1.3.0** · effort:S · priority:P0 · severity:critical

**Title:** `security(ai): verificare HMAC webhook collection-import con hash_equals`

**Labels:** `type:security`, `area:api`, `priority:P0`, `severity:critical`, `effort:S`, `bug`

**Body:**

```markdown
## Contesto

Review ott 2026 §1.2.2: il webhook `POST /ai/webhooks/collection-import` usa `AI_WEBHOOK_TOKEN` / header `X-AI-Webhook-Signature`. Va garantito che il confronto della firma sia **timing-safe** (`hash_equals`), altrimenti rischio di leak timing su secret HMAC.

## Obiettivo

Audit + fix (se necessario) della validazione firma in `CollectionImportWebhookRequest` (o middleware/controller correlato): HMAC SHA-256 sul raw body, confronto con `hash_equals`, 401 su mismatch, test feature.

## Riferimenti file

- `app/Http/Requests/Ai/CollectionImportWebhookRequest.php`
- `app/Http/Controllers/Ai/CollectionImportWebhookController.php`
- `routes/ai.php`
- `.env.example` (`AI_WEBHOOK_TOKEN`)
- Test: `tests/Feature/Ai/*` (creare se assente)

## Passi di implementazione

1. Leggere l’implementazione attuale della verifica firma.
2. Se usa `===` / `strcmp` / confronto stringa non costante → sostituire con `hash_equals($expected, $provided)`.
3. Calcolare `$expected = hash_hmac('sha256', $request->getContent(), $token)`.
4. Token vuoto in prod → fail closed (503/401), non accettare unsigned.
5. Aggiungere feature test: firma valida → 2xx; firma invalida → 401; body alterato → 401.

## Criteri di accettazione

- [ ] Confronto firma solo via `hash_equals`
- [ ] Nessuna accettazione di webhook senza token configurato (in ambiente non-local se applicabile)
- [ ] Test Pest verdi per happy path + 2 failure modes
- [ ] Nessun log del secret in chiaro

## Note di test

```bash
php artisan test --compact --filter=CollectionImportWebhook
```

## Fuori scope

- Rotazione automatica token (`ai:rotate-webhook-token`) — issue separata se serve.
- Auth diversa da HMAC (mTLS, OAuth).

## Related

- Report §1.2.2
- Milestone **1.3.0** (unico micro-fix security critico oltre alle issue già aperte #113/#118)
```

---

### ISSUE C — NEW-4 · Milestone **1.4.0** · effort:M · priority:P1 · severity:medium

**Title:** `perf(files): denormalizzare effective_access sulla tabella files`

**Labels:** `type:performance`, `area:files`, `area:authz`, `priority:P1`, `severity:medium`, `effort:M`, `enhancement`

**Body:**

```markdown
## Contesto

`FilePermissionGuard::effectivelyPrivateIds()` carica `id/parent_id/access` di **tutti** i file in memoria e risolve l’ereditarietà parent→child (commento *ponytail* in `app/Services/Api/FilePermissionGuard.php` ~L70–115). Su librerie grandi → rischio OOM e list lente. Non è hardening critico 1.3.0: è **operator scale** → milestone **1.4.0**.

## Obiettivo

Introdurre colonna denormalizzata `effective_access` (indicizzata), mantenuta da observer/service su create/move/update `access`/`parent_id`, e usarla in `constrainReadable` / listing al posto del full-tree scan.

## Riferimenti file

- `app/Services/Api/FilePermissionGuard.php` (L70–115 e `constrainReadable`)
- `app/Models/File.php`
- `app/Enums/FileAccess.php`
- `app/Services/FileService.php` (`move`, `createFolder`, update access)
- Migrazioni `database/migrations/*files*`
- Test: `tests/Feature/Api/PublicFilesApiTest.php`, `tests/Feature/Files/*`

## Passi di implementazione

1. Migration: `files.effective_access` string nullable + index; backfill artisan command che cammina l’albero una volta.
2. Observer o hook in `FileService` su save/move: ricalcola nodo + discendenti se cambia access/parent.
3. `FilePermissionGuard::effectivelyPrivateIds()` → query `where('effective_access', private)` (o eliminare il metodo in favore di where diretto).
4. Invalidare cache grants se necessario (`forget`).
5. Feature test: file private per inheritance; move under private parent aggiorna effective; list API esclude correttamente.

## Criteri di accettazione

- [ ] Nessun full-table load in hot path list
- [ ] Backfill command idempotente
- [ ] Comportamento AuthZ invariato vs suite esistente (+ nuovi test)
- [ ] Documentato il significato di `effective_access` vs `access`

## Note di test

```bash
php artisan test --compact tests/Feature/Api/PublicFilesApiTest.php
php artisan test --compact --filter=FilePermission
```

## Fuori scope

- Field-level ACL (#122)
- Workspaces (#120)

## Related

- #117 (list query audit) — correlato ma non sostitutivo
- #114 (AuthZ regression) — aggiornare suite dopo il change
- Report §2.1.1
```

---

### ISSUE D — NEW-5 · Milestone **1.4.0** · effort:S · priority:P3 · severity:low

**Title:** `security: middleware SetSecurityHeaders (CSP, X-Frame-Options, Referrer-Policy)`

**Labels:** `type:security`, `priority:P3`, `severity:low`, `effort:S`, `enhancement`

**Body:**

```markdown
## Contesto

Review §1.7.1: mancano header di difesa (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy) sul pannello admin. Non è bloccante per 1.3.0 → **1.4.0**.

## Obiettivo

Middleware `SetSecurityHeaders` registrato sul gruppo web (Inertia), con CSP pragmatica (Vite/Inertia), senza rompere Echo/Reverb o asset CDN.

## Riferimenti file

- Nuovo: `app/Http/Middleware/SetSecurityHeaders.php`
- `bootstrap/app.php` (registrazione middleware)
- Eventuale `config/security.php`

## Passi

1. Implementare middleware con header: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (o SAMEORIGIN se serve embed), `Referrer-Policy`, `Permissions-Policy` restrittiva.
2. CSP baseline per admin; non applicare CSP aggressiva a `/api/*` se rompe client terzi.
3. Feature/browser smoke: login + dashboard caricano; nessun blocco script Vite in local.
4. Documentare override env se necessario.

## Criteri di accettazione

- [ ] Header presenti sulle risposte HTML admin
- [ ] API pubblica non rotta
- [ ] Test o asserzione HTTP sui header principali

## Fuori scope

- HSTS (va sul reverse proxy)
- CSP report-uri pipeline

## Related

- Report §1.7.1
```

---

### ISSUE E — NEW-9 · Milestone **1.4.0** · effort:M · priority:P3 · severity:low

**Title:** `feat(files): adapter storage Google Cloud Storage e Azure Blob`

**Labels:** `area:files`, `enhancement`, `priority:P3`, `severity:low`, `effort:M`

**Body:**

```markdown
## Contesto

Parity Directus (review §4 / NEW-9): oggi `FILES_DISK` supporta local `assets` e S3-compatible. Operatori enterprise chiedono GCS/Azure nativi senza gateway S3.

## Obiettivo

Aggiungere dischi Flysystem per GCS e Azure Blob, documentati in `.env.example` + docs, con test di smoke (mock o container opzionale).

## Riferimenti

- `config/filesystems.php`
- `app/Support/Files/FilesDisk.php`
- `.env.example` / `.env.docker*.example`
- `league/flysystem-aws-s3-v3` già presente — aggiungere adapter ufficiali **solo dopo approval dipendenze**

## Passi

1. Chiedere/ottenere OK per nuove dipendenze Composer (`flysystem-google-cloud-storage` / Azure).
2. Config dischi + env keys.
3. Verificare upload/move/transform path usano `FilesDisk` astratto.
4. Docs installazione.
5. Test unit su risoluzione disco + feature skippata senza credenziali.

## Criteri di accettazione

- [ ] `FILES_DISK=gcs|azure` funziona in config
- [ ] Docs complete
- [ ] Nessuna regressione su `assets`/`s3`

## Fuori scope

- Migrazione automatica tra dischi
- CDN purge

## Related

- #123 asset transforms (stesso area files, milestone 1.4.0)
```

---

### ISSUE F — NEW-10 · Milestone **1.4.0** · effort:S · priority:P2 · severity:medium

**Title:** `perf(files): hashing SHA-256 in streaming su upload (no load intero in RAM)`

**Labels:** `type:performance`, `area:files`, `priority:P2`, `severity:medium`, `effort:S`, `enhancement`

**Body:**

```markdown
## Contesto

`FileService::uploadFile` fa `$uploadedFile->getContent()` per meta + hash (ponytail ~L82–85): file grandi → picco memoria. Scala operatori → **1.4.0**.

## Obiettivo

Calcolare SHA-256 (e, se possibile, meta immagine) in streaming / path file, senza caricare l’intero blob in stringa PHP.

## Riferimenti

- `app/Services/FileService.php` (`uploadFile`, `extractImageMeta`)
- `app/Services/FileChunkUploadService.php` (allineare finalize)
- Test: `tests/Feature/Files/FileChunkUploadServiceTest.php`, `tests/Feature/Admin/FileManagerTest.php`

## Passi

1. `hash_init` / `hash_update_stream` / `hash_final` su real path.
2. Evitare doppio read dove possibile.
3. Test con fixture > pochi MB (o mock) che verifica hash stabile.
4. Commentare/rimuovere ponytail obsoleto.

## Criteri di accettazione

- [ ] Hash identico al metodo precedente su fixture
- [ ] Nessun `getContent()` sull’upload path principale
- [ ] Test verdi

## Fuori scope

- Dedup cross-disk
- Virus scan
```

---

### ISSUE G — NEW-6 · Milestone **1.5.0** *(creare)* · effort:L · priority:P2 · severity:low

**Title:** `feat(ai): classificazione automatica file (vision) + riorganizzazione cartelle`

**Labels:** `type:ai`, `area:files`, `enhancement`, `priority:P2`, `severity:low`, `effort:L`

**Depends on:** #180 (`laravel/ai` ^1.1)

**Body:**

```markdown
## Contesto

Design completo in `docs/review/2026-10-review.md` §3. Obiettivo: dopo upload di immagini/PDF, job asincrono classifica (categoria, tag, colori, OCR), scrive `ai_metadata`, opzionalmente sposta in cartelle (`Products`, `Documents`, …) e applica Spatie tags. Feature prodotto AI → **milestone 1.5.0** (non 1.3.0 hardening, non 1.4.0 operator-core).

## Obiettivo

Ship end-to-end dietro flag `AI_AUTO_CLASSIFY_FILES=false` default off.

## Riferimenti design

- Report §3.3 (migration, `ClassifyFileJob`, `FileClassificationService`, UI `FileAiMetadata`)
- `app/Services/FileService.php` (hook post-upload)
- `app/Ai/Tools/ManageFiles.php` (non sostituire: orchestrare via job)
- Horizon queue

## Passi

1. Attendere merge #180.
2. Migration `ai_metadata` JSON, `ai_processed`, `ai_processed_at`.
3. Service + Job + config costi/modello.
4. UI read-only metadata in file detail.
5. Feature test con fake AI provider / Http::fake.
6. Docs costi (~$34/1k upload GPT-4V) e opt-in.

## Criteri di accettazione

- [ ] Default off; opt-in env
- [ ] Solo mime classifiable
- [ ] Permessi file rispettati (no leak private)
- [ ] Job idempotente / retry safe
- [ ] Test senza chiamate rete reali in CI

## Fuori scope

- Training modelli custom
- Auto-delete duplicati (solo suggest)
- MCP (#121) — separato

## Related

- #180, #181, report §3
```

---

### ISSUE H — NEW-7 · Milestone **1.5.0** · effort:M · priority:P3 · severity:low

**Title:** `feat(ai): gate di moderazione contenuti prima del publish`

**Labels:** `type:ai`, `enhancement`, `priority:P3`, `severity:low`, `effort:M`

**Depends on:** #180

**Body:**

```markdown
## Contesto

Report §3.4.3: opzionale check AI (NSFW / policy) in `CollectionItemPublisher` prima del publish. Milestone **1.5.0**.

## Obiettivo

Setting per-collection `ai_moderation_on_publish`; se on, blocca publish con 422 e motivo; audit log.

## Riferimenti

- `app/Services/Collections/CollectionItemPublisher.php`
- Impostazioni collection / project settings
- Test collections publish/schedule

## Passi

1. Flag setting + UI minimale.
2. Chiamata moderation API via laravel/ai (o provider configurato).
3. Fail open vs fail closed documentato (consiglio: fail closed se AI down e flag on).
4. Test con fake.

## Criteri di accettazione

- [ ] Flag off = comportamento invariato
- [ ] Flag on + contenuto flagged = no publish
- [ ] Activity log entry
- [ ] Docs

## Fuori scope

- Moderazione immagini (coperta da classify)
- Queue umana di review (approvals #48 già chiusa in 1.2.0)
```

---

## 4. Milestone 1.5.0 (da creare)

**Title:** `1.5.0`  
**Description:**

```text
AI & media intelligence after laravel/ai ^1.1: automatic file classification/vision, content moderation gates, and related operator AI product features.

Not for platform hardening (1.3.0) or workspaces/MCP/field-ACL (1.4.0). Depends on #180.
```

---

## 5. Commenti da lasciare su issue esistenti (invece di duplicati)

### Su #113
Aggiungere nota: implementare anche **cost-based** token bucket (mutations=5, include=2) e Lighthouse `max_query_depth` / `max_query_complexity` come in report §1.1.1–1.1.2. Non creare issue separate NEW-1/NEW-3.

### Su #118
Aggiungere nota: oltre MIME allowlist, includere **magic bytes** per pdf/jpeg/png/gif come in report §1.3.1. Non creare NEW-2.

### Su #47
Nessuna azione — COMPLETED; Kanban/Calendar già shippati. NEW-8 scartata.

---

## 6. Checklist post-grant accesso

1. [ ] Creare labels (§2)
2. [ ] Creare milestone `1.5.0` (§4)
3. [ ] Creare issue A–H con milestone/label corretti
4. [ ] Commentare #113 e #118 (§5)
5. [ ] Aprire draft PR da `cursor/review-2026-10-c1af` → `main` (o `develop` se è la base ufficiale)
6. [ ] Collegare PR al report; opzionale Project se ne verrà creato uno

**Base branch PR:** verificare default (`main` vs `develop`). Cloud instructions indicano base `main` per questo agent; il repo usa anche workflow su develop — allineare alla pratica del team.
