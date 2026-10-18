# Keycloak OIDC QA (optional Compose profile)

Local IdP for exercising Externa’s optional SSO / OIDC login. **Not** part of the default stack.

## Start

```bash
# From repo root. Uses Track A compose + this overlay.
cp -n .env.docker.example .env   # if needed; ensure APP_KEY is set
docker compose -f compose.yaml -f compose.oidc.yaml --profile oidc up --build
```

| Service | URL |
| --- | --- |
| App | http://localhost:8000 |
| Keycloak admin | http://localhost:8080 (admin / admin) |
| Realm issuer | http://localhost:8080/realms/externa |
| Discovery (browser) | http://localhost:8080/realms/externa/.well-known/openid-configuration |

Compose sets `OIDC_DISCOVERY_BASE=http://keycloak:8080/realms/externa` and `OIDC_SERVER_ORIGIN=http://keycloak:8080` on `app` so PHP can reach Keycloak on the Docker network while the **browser** uses `localhost` (authorize redirect + Settings issuer).

Override host port with `FORWARD_KEYCLOAK_PORT` if `:8080` is taken (also updates `KC_HOSTNAME`).

## Realm / client / users (imported)

| | |
| --- | --- |
| Realm | `externa` |
| Client ID | `externa-app` (confidential) |
| Client secret | `externa-oidc-qa-secret` |
| Redirect URI | `http://localhost:8000/auth/oidc/callback` |
| Verified user | `oidc-qa@example.com` / `password` (`email_verified=true`) |
| Unverified user | `oidc-unverified@example.com` / `password` (`email_verified=false`) |

Re-import: remove volume `externa_keycloak` then `up` again (`docker volume rm externa_externa_keycloak`).

## Wire Externa Project Settings

**UI:** Settings → Project → SSO / OIDC

- Enable OIDC  
- Issuer: `http://localhost:8080/realms/externa`  
- Client ID: `externa-app`  
- Client secret: `externa-oidc-qa-secret`  
- JIT: off for link-by-email tests  

**Or seed via artisan** (app container):

```bash
docker compose -f compose.yaml -f compose.oidc.yaml --profile oidc exec app php artisan tinker --execute="
\$s = app(\\App\\Services\\Settings\\SettingsRepository::class);
\$s->setMany('project', 'project', [
  'oidc_enabled' => true,
  'oidc_issuer' => 'http://localhost:8080/realms/externa',
  'oidc_client_id' => 'externa-app',
  'oidc_client_secret' => \\App\\Services\\Settings\\ProjectSettings::encryptOidcClientSecret('externa-oidc-qa-secret'),
  'oidc_button_label' => 'Sign in with SSO',
  'oidc_jit_provisioning' => false,
]);
\\App\\Models\\User::query()->firstOrCreate(
  ['email' => 'oidc-qa@example.com'],
  ['first_name' => 'OIDC', 'last_name' => 'QA', 'password' => 'password', 'is_active' => true, 'email_verified_at' => now()]
);
echo 'OIDC settings + local user ready';
"
```

With JIT off, SSO only links an **existing** local user by verified email.

## Browser QA checklist

1. Login page shows SSO button when OIDC enabled.  
2. SSO → Keycloak login (`oidc-qa` / `password`) → redirect → callback → authenticated session.  
3. Password login still works (`superadmin@example.com` / `password` after seed).  
4. Optional: `oidc-unverified` → callback rejects (“verified email”).  
5. Optional: unknown email + JIT off → reject (“No local account…”).

## Notes

- Default path stays `docker compose up` (no Keycloak).  
- Authentik not included; Keycloak only for this QA profile.  
- Do not commit real production IdP secrets; this realm secret is for local QA only.
