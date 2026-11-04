import 'dart:convert';
import 'dart:io';

import 'package:salonkit/models/me.dart';

Map<String, dynamic> fx(String n) => jsonDecode(File('test/fixtures/$n').readAsStringSync()) as Map<String, dynamic>;

/// The owner or barber fixture with its features replaced.
Me meWith({bool barber = false, List<String>? features, bool canAddExpense = false}) {
  final j = fx(barber ? 'me_barber.json' : 'me_owner.json');
  if (features != null) j['features'] = features;
  (j['user'] as Map)['can_add_expense'] = canAddExpense;
  return Me.fromJson(j);
}
