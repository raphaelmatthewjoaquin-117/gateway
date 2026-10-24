# Products, Orders, Auth, and Ocelot Gateway

This .NET 10 demo runs four ASP.NET Core applications. Clients use only the gateway at `http://localhost:5000`; the products, orders, and auth apps bind to localhost on ports 5001–5003.

## Run

Open four terminals at the solution folder and run one command in each:

```powershell
dotnet run --project ProductsService
dotnet run --project OrdersService
dotnet run --project AuthService
dotnet run --project Gateway
```

Once the four apps are running, open **http://localhost:5000** for the interactive dashboard. It lets you browse products, sign in, create/delete products, request protected orders, test the login rate limit, and inspect response codes in an activity feed.

The demo login is `demo` / `DemoPassword123!`. For example, request a token through the gateway:

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:5000/gateway/auth/login `
  -Headers @{ ClientId = "demo-client" } `
  -ContentType application/json -Body '{"username":"demo","password":"DemoPassword123!"}'
$token = $login.token
```

Create a product through the gateway with that token:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5000/gateway/products `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType application/json -Body '{"name":"Mouse","price":19.99}'
```

## Gateway access policy

`GET /gateway/products` and `GET /gateway/products/{id}` are public. `POST /gateway/products`, `PUT`/`DELETE /gateway/products/{id}`, and `GET /gateway/orders` require a valid bearer token. The login endpoint is public and limited to five requests per 10-second window. The matching JWT key, issuer, and audience are in `AuthService/appsettings.json` and `Gateway/appsettings.json`; the gateway validates the token before forwarding protected requests.

The gateway rejects unauthenticated or invalid-token writes and order reads with **401 before forwarding them**. Requests that exceed the login limit receive **429 from the gateway**. Login requests include the non-authentication `ClientId: demo-client` header because Ocelot uses it to identify the rate-limit bucket; it does not replace or act as a bearer token. These endpoints are not defined as downstream routes, so unmatched paths and methods are not forwarded.

The services bind to `localhost`, rather than all network interfaces, so they are not directly exposed to other machines. Local programs on the same machine can still access localhost ports; this is a learning demo, not network isolation. In production, use private service networking/firewall rules and store the signing key and credentials in a secret manager. The checked-in signing key and login are demo-only.

## Test matrix

Run every request against the gateway base URL `http://localhost:5000`. Send `ClientId: demo-client` on login requests, and wait 11 seconds before the rate-limit burst to start a fresh window.

| Request | Token | Expected | Observed |
|---|---|---:|---:|
| `GET /gateway/products` | none | 200 | 200 |
| `GET /gateway/products/1` | none | 200 | 200 |
| `POST /gateway/auth/login` with correct credentials | none; `ClientId: demo-client` | 200 + token | 200 + token |
| `POST /gateway/products` | none | 401 | 401 |
| `POST /gateway/products` | valid token | 201 | 201 |
| `GET /gateway/orders` | none | 401 | 401 |
| `GET /gateway/orders` | valid token | 200 | 200 |
| Six rapid `POST /gateway/auth/login` requests | none; same `ClientId` | Requests 1–5: 200; request 6: 429 | 200, 200, 200, 200, 200, 429 |

## Troubleshooting

| Symptom | Likely cause | What to check |
|---|---|---|
| A matching route returns 404 | Path template or HTTP method does not match | Compare the request path and method with `UpstreamPathTemplate` and `UpstreamHttpMethod`; check for a trailing slash. |
| Gateway startup complains about an authentication provider | The route names a JWT scheme that is not registered | The `GatewayKey` in `AuthenticationProviderKeys` must match `.AddJwtBearer("GatewayKey", ...)` in `Gateway/Program.cs`. |
| A valid token still gets 401 | The signing key, issuer, or audience differs | Compare the `Jwt` values in `AuthService/appsettings.json` and `Gateway/appsettings.json`; they must match. |
| Gateway returns 502 or 500 | A downstream app is stopped or the route points to the wrong address | Start the downstream service and verify its host/port in `Gateway/ocelot.json`. |
| The wrong route handles a request | More than one route pattern matches | Use specific templates and set a higher `Priority` for the intended specific route. |
| Login rate limit does not trigger | Rate limiting is disabled, requests use different client IDs, or the limit/window was not reached | Keep `EnableRateLimiting: true`, send the same `ClientId` header for all six logins, and wait 11 seconds before starting a fresh test. |
| Login returns 429 before the sixth test request | Earlier logins already used this client ID's quota | Wait at least 11 seconds for the 10-second window to reset, then run the six-request test again. |

## GitHub submission

Create a new, empty repository on GitHub (do not add a README or `.gitignore` there). From this solution folder, initialize and push the project using the repository URL GitHub gives you:

```powershell
git init
git add .
git commit -m "Add Ocelot gateway and demo services"
git branch -M main
git remote add origin <your-github-repository-url>
git push -u origin main
```

Replace `<your-github-repository-url>` with your repository's HTTPS or SSH URL. Then, on GitHub, open the repository's **Settings → Collaborators** (or **Collaborators and teams**) and invite `ChristopherSenoUAC`. Submit the repository link after the invitation is sent. The demo signing key and login in this repository are for local learning only; do not use them in a deployed application.
