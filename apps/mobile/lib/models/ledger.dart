import 'json.dart';

List<T> _list<T>(Object? j, String what, T Function(Map<String, dynamic>) f) {
  if (j is! List) throw FormatException('Expected a list of $what');
  return [for (final x in j) f(obj(x, what))];
}

class Balances {
  const Balances({required this.cash, required this.bank, required this.barbers});
  final int cash, bank;
  final Map<int, int> barbers;
  factory Balances.fromJson(Map<String, dynamic> j) => Balances(
        cash: integer(j, 'cash'),
        bank: integer(j, 'bank'),
        barbers: {for (final e in obj(j['barbers'] ?? <String, dynamic>{}, 'barbers').entries) int.parse(e.key): e.value as int},
      );
}

/// One money movement. [amount] is signed; [balance] is the running balance after it.
class LedgerLine {
  const LedgerLine({required this.id, required this.at, required this.day, this.account, required this.amount, required this.kind, required this.source, this.sourceId, this.ref, required this.memo, required this.reversed, this.reversesId, this.actorName, required this.balance});
  final int id, at, amount, balance;
  final String day, kind, source, memo;
  final String? account, ref, actorName;
  final int? sourceId, reversesId;
  final bool reversed;

  /// A money move the admin can open and change (not a reversal, not reversed).
  bool get openableTransfer => source == 'transfer' && reversesId == null && !reversed;
  bool get openablePayout => source == 'payout' && reversesId == null && !reversed;

  factory LedgerLine.fromJson(Map<String, dynamic> j) => LedgerLine(
        id: integer(j, 'id'),
        at: integer(j, 'at'),
        day: str(j, 'day'),
        account: strOrNull(j, 'account'),
        amount: integer(j, 'amount'),
        kind: str(j, 'kind'),
        source: str(j, 'source'),
        sourceId: j['source_id'] is int ? j['source_id'] as int : null,
        ref: strOrNull(j, 'ref'),
        memo: str(j, 'memo'),
        reversed: j['reversed'] == true,
        reversesId: j['reverses_id'] is int ? j['reverses_id'] as int : null,
        actorName: strOrNull(j, 'actor_name'),
        balance: integer(j, 'balance'),
      );
}

class ShopLedger {
  const ShopLedger({required this.from, required this.to, required this.account, required this.openingCash, required this.openingBank, required this.closingCash, required this.closingBank, required this.lines});
  final String from, to, account;
  final int openingCash, openingBank, closingCash, closingBank;
  final List<LedgerLine> lines;

  int get opening => account == 'cash' ? openingCash : account == 'bank' ? openingBank : openingCash + openingBank;
  int get closing => account == 'cash' ? closingCash : account == 'bank' ? closingBank : closingCash + closingBank;

  factory ShopLedger.fromJson(Map<String, dynamic> j) {
    final o = obj(j['opening'], 'opening'), c = obj(j['closing'], 'closing');
    return ShopLedger(
      from: str(j, 'from'),
      to: str(j, 'to'),
      account: str(j, 'account'),
      openingCash: integer(o, 'cash'),
      openingBank: integer(o, 'bank'),
      closingCash: integer(c, 'cash'),
      closingBank: integer(c, 'bank'),
      lines: _list(j['lines'], 'lines', LedgerLine.fromJson),
    );
  }
}

class BarberBalance {
  const BarberBalance({required this.id, required this.name, this.avatarUrl, required this.active, required this.earned, required this.paid, required this.balance});
  final int id, earned, paid, balance;
  final String name;
  final String? avatarUrl;
  final bool active;
  factory BarberBalance.fromJson(Map<String, dynamic> j) => BarberBalance(
        id: integer(j, 'id'),
        name: str(j, 'name'),
        avatarUrl: strOrNull(j, 'avatar_url'),
        active: j['active'] != false,
        earned: integer(j, 'earned'),
        paid: integer(j, 'paid'),
        balance: integer(j, 'balance'),
      );
  static List<BarberBalance> listFromJson(Object? j) => _list(j, 'barbers', BarberBalance.fromJson);
}

class BarberStatement {
  const BarberStatement({required this.barber, required this.from, required this.to, required this.opening, required this.lines});
  final BarberBalance barber;
  final String from, to;
  final int opening;
  final List<LedgerLine> lines;
  factory BarberStatement.fromJson(Map<String, dynamic> j) => BarberStatement(
        barber: BarberBalance.fromJson(obj(j['barber'], 'barber')),
        from: str(j, 'from'),
        to: str(j, 'to'),
        opening: integer(j, 'opening'),
        lines: _list(j['lines'], 'lines', LedgerLine.fromJson),
      );
}

/// Money moved between the cash drawer and the bank.
class Transfer {
  const Transfer({required this.id, required this.day, required this.amount, required this.fromAccount, required this.toAccount, this.note});
  final int id, amount;
  final String day, fromAccount, toAccount;
  final String? note;
  factory Transfer.fromJson(Map<String, dynamic> j) =>
      Transfer(id: integer(j, 'id'), day: str(j, 'day'), amount: integer(j, 'amount'), fromAccount: str(j, 'from_account'), toAccount: str(j, 'to_account'), note: strOrNull(j, 'note'));
  static List<Transfer> listFromJson(Object? j) => _list(j, 'transfers', Transfer.fromJson);
}

/// Money given to a barber (commission, salary or an advance).
class Payout {
  const Payout({required this.id, required this.barberId, required this.barberName, required this.day, required this.amount, required this.paidFrom, this.note});
  final int id, barberId, amount;
  final String barberName, day, paidFrom;
  final String? note;
  factory Payout.fromJson(Map<String, dynamic> j) => Payout(
        id: integer(j, 'id'),
        barberId: integer(j, 'barber_id'),
        barberName: str(j, 'barber_name'),
        day: str(j, 'day'),
        amount: integer(j, 'amount'),
        paidFrom: str(j, 'paid_from'),
        note: strOrNull(j, 'note'),
      );
  static List<Payout> listFromJson(Object? j) => _list(j, 'payouts', Payout.fromJson);
}
