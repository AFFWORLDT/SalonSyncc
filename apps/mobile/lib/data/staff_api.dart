import '../core/api/api_client.dart';
import '../core/api/api_error.dart';
import '../models/staff.dart';

/// 409 staff_limit: the plan's active-staff limit is reached (on add or re-activate).
class StaffLimit extends Validation {
  const StaffLimit(super.message) : super(code: 'staff_limit');
}

enum StaffDeleted { deleted, deactivated }

/// The add / edit staff form, as the API takes it. [commissionPct] is the typed text ('' = shop default).
class StaffForm {
  const StaffForm({required this.name, required this.username, this.phone, required this.role, this.commissionPct = '', this.sortOrder = 0, this.canAddExpense = false});
  final String name, username, role, commissionPct;
  final String? phone;
  final int sortOrder;
  final bool canAddExpense;

  Map<String, Object?> toJson() => {
        'name': name.trim(),
        'username': username.trim(),
        'phone': (phone ?? '').trim().isEmpty ? null : phone!.trim(),
        'role': role,
        'commission_pct': commissionPct.trim().isEmpty ? null : commissionPct.trim(),
        'sort_order': sortOrder,
        'can_add_expense': canAddExpense,
      };
}

class StaffApi {
  StaffApi(this.api);
  final ApiClient api;

  Future<List<Staff>> list() => api.get('/api/users', Staff.listFromJson);

  Future<Staff> create(StaffForm f, {required String password}) => _limit(() => api.post('/api/users', {...f.toJson(), 'password': password}, _one));

  Future<Staff> update(int id, StaffForm f, {required bool active}) => _limit(() => api.put('/api/users/$id', {...f.toJson(), 'active': active}, _one));

  Future<void> resetPassword(int id, String password) => api.post('/api/users/$id/reset-password', {'password': password}, (_) {});

  /// Someone with sales or expenses is made inactive instead of deleted (old reports stay right).
  Future<StaffDeleted> delete(int id) =>
      api.delete('/api/users/$id', (j) => j is Map && j['deactivated'] == true ? StaffDeleted.deactivated : StaffDeleted.deleted);

  static Staff _one(Object? j) => Staff.fromJson(j as Map<String, dynamic>);

  static Future<T> _limit<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on Validation catch (e) {
      if (e.code == 'staff_limit') throw StaffLimit(e.message);
      rethrow;
    }
  }
}
