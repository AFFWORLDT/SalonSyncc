import '../core/api/api_client.dart';
import '../models/billing.dart';

class BillingApi {
  BillingApi(this.api);
  final ApiClient api;

  Future<Billing> get() => api.get('/api/billing', (j) => Billing.fromJson(j as Map<String, dynamic>));

  /// The Stripe page to open in the browser.
  Future<String> checkout(String planId) => api.post('/api/billing/checkout', {'plan_id': planId}, (j) => (j as Map)['url'] as String);
  Future<String> portal() => api.post('/api/billing/portal', <String, Object?>{}, (j) => (j as Map)['url'] as String);

  /// Owner only: back to the Free plan.
  Future<void> free() => api.post('/api/billing/free', <String, Object?>{}, (_) {});
}
