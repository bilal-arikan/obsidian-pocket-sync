# obsidian-pocketbase-sync — Geliştirici Notları

Obsidian vault'larını kendi barındırılan bir PocketBase sunucusuyla senkronize
eden Obsidian eklentisi. (Kod/yorum İngilizce, dokümanlar Türkçe.)

## Hızlı Komutlar (PowerShell)

```powershell
npm run dev      # esbuild watch
npm run build    # tsc tip kontrolü + production bundle (main.js)
node scripts\deploy.mjs "C:\Users\Bilal\Documents\Obsidian Vault"
node scripts\smoke-test.mjs "http://127.0.0.1:8095" "obsidian@local.sync" "<sifre>"
```

## Çalışan Ortam (mevcut kurulum)

- **PocketBase**: `C:\Users\Bilal\Desktop\Progs\pocketbase\pocketbase.exe` (v0.39.4)
- **Port**: `8095` — çünkü `8090` başka bir servis (React frontend) tarafından kullanılıyor.
- Başlatma: `& .\pocketbase.exe serve --http=127.0.0.1:8095`
- **Superuser**: `bilal1993arikan@gmail.com`
- **Eklenti kullanıcısı** (`users` koleksiyonu): `obsidian@local.sync`
- Hedef vault: `C:\Users\Bilal\Documents\Obsidian Vault` (eklenti etkin, `data.json` önceden dolduruldu)

## Mimari

```
main.ts          -> yaşam döngüsü, komut/ribbon, auto-sync timer, durum çubuğu
settings.ts      -> ayar arayüzü + bağlantı testi
sync-engine.ts   -> 3-yönlü diff (snapshot=ortak ata) + işlem uygulama
pocketbase-client.ts -> PB SDK sarmalayıcı (auth, list, download, create/update/tombstone)
vault-index.ts   -> adapter ile özyinelemeli tarama + içerik hash'i
utils.ts         -> hash, normalizePath, isIgnored
types.ts         -> tipler, DEFAULT_SETTINGS, COLLECTION="vault_files"
```

## Sync Mantığı (özet)

- Her dosya yolu için `(local, remote, base=lastSyncState)` üçlüsüne bakılır.
- Tek taraf değiştiyse push/pull; iki taraf da değiştiyse `conflictStrategy`.
- Silme = tombstone (`deleted=true`). Sil/düzenle çakışmasında `newer` stratejisi
  düzenleme lehine karar verir (veri kaybı önlenir).
- Çakışmada kaybeden taraf `_sync_conflicts/` altına yedeklenir (`backupConflicts`).

## Sunucu Şeması

`vault_files` koleksiyonu — `pb_migrations/1750000000_create_vault_files.js`.
Alanlar: vault, path, hash, mtime, size, deleted, content(file), created/updated.
Benzersiz indeks: `(vault, path)`. Erişim kuralları: `@request.auth.id != ""`.

Rate limit — `pb_migrations/1750000100_enable_rate_limits.js`. Yerleşik PocketBase
limiter'ını açar; `*:auth` 5/60s (brute force engeli), `/api/` 300/10s vb.
Test edildi: 5 hatalı login sonrası HTTP 429. JSVM `settings.rateLimits.rules`'a
plain object array atanabiliyor (RateLimitRule constructor'ı gerekmez).

## Docker Dağıtımı (`deploy/`)

- `Dockerfile` — alpine + sabit PocketBase binary + `pb_migrations` gömülü.
- `docker-compose.yml` — PocketBase + Caddy (otomatik HTTPS + rate_limit) + fail2ban, VPS için.
  - `caddy/Dockerfile` — xcaddy ile `mholt/caddy-ratelimit` eklentili Caddy (v2.11.4 derlendi).
  - `caddy/Dockerfile` ayrıca `caddy-dns/cloudflare` içerir → **DNS-01** ile özel portta TLS.
  - `Caddyfile` — site `{$PB_DOMAIN}:{$HTTPS_PORT}`, `tls { dns cloudflare {env.CF_API_TOKEN} }`,
    JSON access log (`/var/log/caddy`) + rate_limit zone'ları (auth 15/60s, api 600/60s).
  - **Port modeli:** Caddy 80/443 yerine özel HTTPS portu (`.env` `HTTPS_PORT`, varsayılan
    **9443** — VPS'te 8443 code-server'da). Sertifika DNS-01 (Cloudflare) ile alınır,
    80/443 gerekmez → mevcut `myhermes-caddy` (443) ile çakışmaz. Eklenti URL'i `https://domain:9443`.
    VPS'te `sudo ufw allow 9443/tcp` gerekir (public default DENY).
  - `fail2ban/` — jail `caddy-auth` (DOCKER-USER zinciri!), filter Caddy JSON log'u 400/401/429 eşler.
    Test: `fail2ban-regex` 3/4 satır doğru eşledi; epoch datepattern çalıştı.
  - 3 katman brute-force savunması; detay `deploy/README.md`. Test edildi (2026-06-25):
    caddy build OK, `caddy validate` Valid, `docker compose config` Valid.
- `docker-compose.simple.yml` — sadece PocketBase, `8095:8090`, yerel test için.
- **Yerelde test edildi (2026-06-25):** simple compose build + up → sağlık OK,
  migration'lar uygulandı, koleksiyon + rate limit doğrulandı, 429 testi geçti.
  Yerel native instance yerini docker container `pocketbase` aldı (aynı 8095,
  named volume `deploy_pb_data`, aynı superuser/kullanıcı yeniden oluşturuldu).

## Dikkat / Bilinen Noktalar

- PowerShell 5.1'de `Invoke-RestMethod` bazı yanıtlarda `NullReferenceException`
  veriyor; API testleri için `curl.exe` + `--data "@dosya.json"` daha güvenilir.
- Hash, içerik tabanlı (FNV türevi 64-bit). Büyük vault'larda her sync'te tüm
  dosyalar okunur — gerekirse mtime+size cache ile optimize edilebilir.
- Mobilde `127.0.0.1` çalışmaz; sunucuya ağdan erişilebilir URL gerekir.
