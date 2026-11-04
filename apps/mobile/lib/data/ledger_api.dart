import '../core/api/api_client.dart';
import '../models/ledger.dart';

/// The shop's money book: balances, the shop ledger, barbers' owed amounts, money moves and payouts. Amounts sent as typed.
class LedgerApi {
  LedgerApi(this.api);
  final ApiClient api;

  Future<Balances> balances() => api.get('/api/ledger/balances', (j) => Balances.fromJson(j as Map<String, dynamic>));

  /// What is really in the drawer and the bank (0 and negatives allowed); the difference becomes a "Balance set" line.
  Future<void> setBalances({required String cash, required String bank}) => api.put('/api/ledger/balances', {'cash': cash, 'bank': bank}, (_) {});

  Future<ShopLedger> shop(String from, String to, String account) =>
      api.get('/api/ledger/shop', (j) => ShopLedger.fromJson(j as Map<String, dynamic>), query: {'from': from, 'to': to, 'account': account});

  Future<List<BarberBalance>> barbers() => api.get('/api/ledger/barbers', BarberBalance.listFromJson);

  Future<BarberStatement> statement(int id, String from, String to) =>
      api.get('/api/ledger/barbers/$id', (j) => BarberStatement.fromJson(j as Map<String, dynamic>), query: {'from': from, 'to': to});

  Future<List<Transfer>> transfers(String month) => api.get('/api/transfers', Transfer.listFromJson, query: {'month': month});

  Future<void> saveTransfer({int? id, required String amount, required String from, required String to, required String day, required String note}) {
    final body = {'amount': amount, 'from_account': from, 'to_account': to, 'day': day, 'note': note};
    return id == null ? api.post('/api/transfers', body, (_) {}) : api.put('/api/transfers/$id', body, (_) {});
  }

  Future<void> deleteTransfer(int id) => api.delete('/api/transfers/$id', (_) {});

  Future<List<Payout>> payouts(String month, {int? barberId}) => api.get('/api/payouts', Payout.listFromJson, query: {'month': month, 'barber_id': ?barberId});

  Future<void> savePayout({int? id, required int barberId, required String amount, required String paidFrom, required String day, required String note}) {
    final body = {'barber_id': barberId, 'amount': amount, 'paid_from': paidFrom, 'day': day, 'note': note};
    return id == null ? api.post('/api/payouts', body, (_) {}) : api.put('/api/payouts/$id', body, (_) {});
  }

  Future<void> deletePayout(int id) => api.delete('/api/payouts/$id', (_) {});
}
