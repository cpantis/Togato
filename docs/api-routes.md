# Rutele API

Generat automat din cod (`npm run docs:routes -w @togato/api`) — nu editați de mână.
Autentificare: cookie `togato_session` + antet `X-CSRF-Token` pentru modificări (browser) sau `Authorization: Bearer <token>` (clienți API).
Erori: JSON `{ error, code? }`; 401 sesiune, 402 abonament / limită, 403 rol / politică, 404 inexistent sau din alt cabinet, 429 prea multe cereri.

## Operațional

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/health` | public |
| `GET` | `/health/ready` | public |

## Autentificare (public)

| Metodă | Rută | Acces |
|---|---|---|
| `POST` | `/api/auth/signup` | public |
| `POST` | `/api/auth/login` | public |
| `POST` | `/api/auth/login/mfa` | public |
| `GET` | `/api/auth/me` | public |
| `GET` | `/api/auth/invitation/:token` | public |
| `POST` | `/api/auth/accept-invitation` | public |
| `POST` | `/api/auth/logout` | public |
| `POST` | `/api/auth/password/forgot` | public |
| `POST` | `/api/auth/password/reset` | public |
| `POST` | `/api/auth/verify-email` | public |

## Portalul clientului (public, token în URL)

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/portal/:token` | public |
| `POST` | `/api/portal/:token/systems` | public |
| `DELETE` | `/api/portal/:token/systems/:id` | public |

## Autoevaluarea firmelor și directorul cabinetelor (public)

| Metodă | Rută | Acces |
|---|---|---|
| `POST` | `/api/self-assessments` | public |
| `POST` | `/api/self-assessment-recovery` | public |
| `GET` | `/api/self-assessments/:token` | public |
| `PUT` | `/api/self-assessments/:token` | public |
| `POST` | `/api/self-assessments/:token/verify` | public |
| `POST` | `/api/self-assessments/:token/resend-confirmation` | public |
| `POST` | `/api/self-assessments/:token/tools` | public |
| `DELETE` | `/api/self-assessments/:token/tools/:toolId` | public |
| `DELETE` | `/api/self-assessments/:token` | public |
| `POST` | `/api/self-assessments/:token/requests` | public |
| `GET` | `/api/directory` | public |
| `GET` | `/api/directory/counties` | public |

## Solicitări primite de cabinet

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/referrals` | sesiune |
| `GET` | `/api/referrals/:id` | sesiune |
| `POST` | `/api/referrals/:id/accept` | sesiune |
| `POST` | `/api/referrals/:id/decline` | sesiune |

## Fișiere publice

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/public/logo/:orgId` | public |

## Stripe (webhook semnat)

| Metodă | Rută | Acces |
|---|---|---|
| `POST` | `/api/stripe/webhook` | public |

## Contul propriu

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/account/security` | sesiune |
| `POST` | `/api/account/password` | sesiune |
| `GET` | `/api/account/sessions` | sesiune |
| `DELETE` | `/api/account/sessions/:id` | sesiune |
| `POST` | `/api/account/sessions/revoke-others` | sesiune |
| `GET` | `/api/account/notifications` | sesiune |
| `PUT` | `/api/account/notifications` | sesiune |
| `POST` | `/api/account/2fa/setup` | sesiune |
| `POST` | `/api/account/2fa/enable` | sesiune |
| `POST` | `/api/account/2fa/recovery-codes` | sesiune |
| `POST` | `/api/account/2fa/disable` | sesiune |
| `POST` | `/api/account/resend-verification` | sesiune |

## Cabinet

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/organization` | sesiune |
| `PUT` | `/api/organization` | sesiune |
| `POST` | `/api/organization/logo` | sesiune |
| `DELETE` | `/api/organization/logo` | sesiune |
| `POST` | `/api/organization/support-access` | sesiune |
| `DELETE` | `/api/organization/support-access` | sesiune |
| `PUT` | `/api/organization/directory` | sesiune |
| `POST` | `/api/organization/legal/accept` | sesiune |
| `GET` | `/api/organization/export` | sesiune |
| `POST` | `/api/organization/closure` | sesiune |
| `DELETE` | `/api/organization/closure` | sesiune |
| `PUT` | `/api/organization/retention` | sesiune |

## Echipă

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/team` | sesiune |
| `POST` | `/api/team/invitations` | sesiune |
| `DELETE` | `/api/team/invitations/:id` | sesiune |
| `PATCH` | `/api/team/members/:id` | sesiune |
| `POST` | `/api/team/members/:id/reset-2fa` | sesiune |

## Abonament

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/billing` | sesiune |
| `POST` | `/api/billing/checkout` | sesiune |
| `POST` | `/api/billing/portal` | sesiune |

## GDPR: registru, cereri, incidente

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/clients/:clientId/gdpr` | sesiune |
| `GET` | `/api/gdpr/overview` | sesiune |
| `POST` | `/api/clients/:clientId/processing` | sesiune |
| `PUT` | `/api/processing/:id` | sesiune |
| `DELETE` | `/api/processing/:id` | sesiune |
| `GET` | `/api/clients/:clientId/gdpr/ropa` | sesiune |
| `POST` | `/api/clients/:clientId/dsar` | sesiune |
| `PATCH` | `/api/dsar/:id` | sesiune |
| `DELETE` | `/api/dsar/:id` | sesiune |
| `POST` | `/api/clients/:clientId/breaches` | sesiune |
| `PUT` | `/api/breaches/:id` | sesiune |
| `DELETE` | `/api/breaches/:id` | sesiune |
| `GET` | `/api/breaches/:id/notification` | sesiune |
| `GET` | `/api/processing/:id/dpia` | sesiune |
| `PUT` | `/api/processing/:id/dpia` | sesiune |
| `GET` | `/api/processing/:id/dpia/docx` | sesiune |
| `GET` | `/api/dsar/:id/letter` | sesiune |

## Clienți

| Metodă | Rută | Acces |
|---|---|---|
| `POST` | `/api/clients/:clientId/ai-systems` | sesiune |
| `GET` | `/api/clients/:id/documents` | sesiune |
| `GET` | `/api/clients/:id/documents/:type` | sesiune |
| `GET` | `/api/clients/:id/portal` | sesiune |
| `POST` | `/api/clients/:id/portal` | sesiune |
| `DELETE` | `/api/clients/:id/portal` | sesiune |
| `POST` | `/api/clients/lookup` | sesiune |
| `GET` | `/api/clients` | sesiune |
| `POST` | `/api/clients/demo` | sesiune |
| `POST` | `/api/clients` | sesiune |
| `GET` | `/api/clients/:id` | sesiune |
| `PUT` | `/api/clients/:id` | sesiune |
| `POST` | `/api/clients/:id/archive` | sesiune |
| `POST` | `/api/clients/:id/unarchive` | sesiune |
| `DELETE` | `/api/clients/:id` | sesiune |
| `GET` | `/api/clients/:id/export` | sesiune |
| `GET` | `/api/clients/:id/access` | sesiune |
| `PUT` | `/api/clients/:id/access` | sesiune |
| `PATCH` | `/api/clients/:id/ai` | sesiune |
| `PATCH` | `/api/clients/:id/responsible` | sesiune |

## Sisteme AI

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/ai-systems/:id` | sesiune |
| `PUT` | `/api/ai-systems/:id` | sesiune |
| `DELETE` | `/api/ai-systems/:id` | sesiune |
| `POST` | `/api/ai-systems/:id/review` | sesiune |
| `POST` | `/api/ai-systems/:id/memo` | sesiune |
| `POST` | `/api/ai-systems/:id/override` | sesiune |
| `GET` | `/api/ai-systems/:id/snapshots` | sesiune |

## Obligații și dovezi

| Metodă | Rută | Acces |
|---|---|---|
| `PATCH` | `/api/obligations/:id` | sesiune |
| `GET` | `/api/obligations/:id/evidence` | sesiune |
| `POST` | `/api/obligations/:id/evidence` | sesiune |
| `GET` | `/api/evidence/:id` | sesiune |
| `DELETE` | `/api/evidence/:id` | sesiune |

## Avize înghețate

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/snapshots/:id/pdf` | sesiune |

## Panou, legislație, textul legii

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/dashboard` | sesiune |
| `GET` | `/api/legislation` | sesiune |
| `GET` | `/api/law` | sesiune |
| `GET` | `/api/law/source` | sesiune |

## Consola platformei (echipa Togato)

| Metodă | Rută | Acces |
|---|---|---|
| `GET` | `/api/platform/organizations` | sesiune |
| `POST` | `/api/platform/organizations/:id/suspend` | sesiune |
| `POST` | `/api/platform/organizations/:id/unsuspend` | sesiune |
| `POST` | `/api/platform/organizations/:id/trial` | sesiune |
| `POST` | `/api/platform/organizations/:id/plan` | sesiune |
| `GET` | `/api/platform/organizations/:id/support` | sesiune |
| `GET` | `/api/platform/audit` | sesiune |
| `GET` | `/api/platform/status` | sesiune |

## Altele

| Metodă | Rută | Acces |
|---|---|---|
| `POST` | `/api/email/webhook` | sesiune |
