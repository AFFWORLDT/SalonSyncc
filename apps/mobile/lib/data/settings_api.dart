import '../core/api/api_client.dart';

/// Every key PUT /api/settings takes (packages/contract SETTINGS_INPUT_KEYS). The API replaces all of them, so a save
/// sends each one — the ones the phone doesn't show go back exactly as loaded.
const kSettingsInputKeys = [
  'display_name', 'salon_name_ar', 'tagline', 'address', 'phone', 'licence_no', 'trn', 'vat_enabled', 'vat_rate',
  'default_commission_pct', 'quick_amounts', 'thank_you_text', 'receipt_footer', 'notify_sales', 'notify_sale_min',
  'notify_summary', 'summary_hour', 'notify_reminder', 'reminder_hour', 'notify_barber_changes', 'google_review_url',
  'instagram_url', 'google_maps_url', 'timezone', 'day_start_hour', 'currency', 'locale', 'phone_country', 'bill_prefix', 'wa_bill_auto',
  'wa_bill_template', 'wa_bill_pdf_template', 'wa_reminder_enabled', 'wa_reminder_days', 'wa_reminder_hour',
  'wa_reminder_template', 'wa_language', 'wa_feedback_enabled', 'wa_feedback_delay_min', 'wa_feedback_template',
  'wa_feedback_reminder_min', 'wa_feedback_reminder_template', 'wa_rating_image_url', 'wa_rating_reminder_image_url',
  'wa_fresh_cut_image_url',
];

class SettingsApi {
  SettingsApi(this.api);
  final ApiClient api;

  Future<Map<String, dynamic>> get() => api.get('/api/settings', (j) => Map<String, dynamic>.from(j as Map));

  Future<Map<String, dynamic>> save(Map<String, dynamic> s) =>
      api.put('/api/settings', {for (final k in kSettingsInputKeys) k: s[k]}, (j) => Map<String, dynamic>.from(j as Map));

  Future<String?> uploadLogo(List<int> bytes, String contentType) => api.putBytes('/api/settings/logo', bytes, contentType, (j) => (j as Map)['logo_url'] as String?);
  Future<void> removeLogo() => api.delete('/api/settings/logo', (_) {});

  /// The connected WhatsApp number's settings (no token), or null.
  Future<Map<String, dynamic>?> waConfig() => api.get('/api/whatsapp/config', (j) => j == null ? null : Map<String, dynamic>.from(j as Map));
  Future<void> saveWa({required String phoneNumberId, required String wabaId, required String token, List<String>? testNumbers}) =>
      api.put('/api/whatsapp/config', {'phone_number_id': phoneNumberId.trim(), 'waba_id': wabaId.trim(), 'token': token.trim(), 'test_numbers': testNumbers}, (_) {});
  Future<void> removeWa() => api.delete('/api/whatsapp/config', (_) {});

  /// "Send due … now": {due, sent, failed, skipped}.
  Future<Map<String, dynamic>> runReminders() => api.post('/api/wa/reminders/run', <String, Object?>{}, (j) => Map<String, dynamic>.from(j as Map));
  Future<Map<String, dynamic>> runFeedback() => api.post('/api/wa/feedback/run', <String, Object?>{}, (j) => Map<String, dynamic>.from(j as Map));
}
