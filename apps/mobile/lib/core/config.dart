/// Where the app finds a salon's API. Each salon is served on its own host, `https://<slug>.salonkit.online`, so the
/// server resolves the salon from the host exactly as it does for the web app.
///
/// Dev builds: `--dart-define=SK_DEV_HOST=http://10.0.2.2:8787` sends every call to a local `wrangler dev`, which runs
/// without ROOT_DOMAIN; the client then names the salon with `?org=` (public calls) and `org` (sign-in body).
library;

const kRootDomain = String.fromEnvironment('SK_ROOT_DOMAIN', defaultValue: 'salonkit.online');
const kDevHost = String.fromEnvironment('SK_DEV_HOST');
bool get isDevHost => kDevHost.isNotEmpty;

final _slugRe = RegExp(r'^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$');
final _spaces = RegExp(r'[\s_]+');

/// Same as the server's normalizeSlug (apps/api/src/core/tenant.ts).
String normalizeSlug(String s) => s.trim().toLowerCase().replaceAll(_spaces, '-');

bool isValidSlug(String s) => _slugRe.hasMatch(s);

Uri salonBase(String slug) => isDevHost ? Uri.parse(kDevHost) : Uri.https('$slug.$kRootDomain');

/// The bare domain's API: "sign in with just your email" and sign-up, before the salon is known (the server finds it
/// from the email; salonkit.online/api/* is the same server).
Uri rootBase() => isDevHost ? Uri.parse(kDevHost) : Uri.https(kRootDomain);

/// The salon of a one-tap link host (`<slug>.salonkit.online`), or null.
String? slugOfLinkHost(String host) {
  final h = host.toLowerCase(), suffix = '.$kRootDomain';
  if (!h.endsWith(suffix)) return null;
  final s = h.substring(0, h.length - suffix.length);
  return isValidSlug(s) ? s : null;
}

/// The API host used before a salon is chosen (app version check). The bare root domain is the marketing site.
Uri configBase() => isDevHost ? Uri.parse(kDevHost) : Uri.https('admin.$kRootDomain');

/// Joins a server path such as a logo_url ("/api/public/logo/3?org=x") onto the salon's host; full URLs pass through.
Uri absolute(Uri base, String pathOrUrl) => base.resolve(pathOrUrl);
