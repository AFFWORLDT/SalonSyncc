import '../core/api/api_client.dart';
import '../models/expense.dart';

class ExpensesApi {
  ExpensesApi(this.api);
  final ApiClient api;

  Future<List<Expense>> barber(String month, {int? barberId}) =>
      api.get('/api/expenses', Expense.listFromJson, query: {'month': month, 'barber_id': ?barberId});

  /// One entry per barber per day; amount "0" or "" removes it.
  Future<void> saveBarber({required String amount, required String note, required String day, required int barberId}) =>
      api.put('/api/expenses', {'amount': amount, 'note': note, 'day': day, 'barber_id': barberId}, (_) {});

  Future<List<CompanyExpense>> company(String month) => api.get('/api/company-expenses', CompanyExpense.listFromJson, query: {'month': month});

  Map<String, Object?> _body(String amount, String note, String paidFrom, String day) => {'amount': amount, 'note': note, 'paid_from': paidFrom, 'day': day};

  Future<void> addCompany({required String amount, required String note, required String paidFrom, required String day}) =>
      api.post('/api/company-expenses', _body(amount, note, paidFrom, day), (_) {});

  Future<void> editCompany(int id, {required String amount, required String note, required String paidFrom, required String day}) =>
      api.put('/api/company-expenses/$id', _body(amount, note, paidFrom, day), (_) {});

  Future<void> deleteCompany(int id) => api.delete('/api/company-expenses/$id', (_) {});
}
