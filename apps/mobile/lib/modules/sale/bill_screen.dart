import 'package:flutter/material.dart';

import '../../core/format/fmt.dart';
import '../../core/ui/route.dart';
import '../../data/sales_api.dart';
import '../../data/staff_api.dart';
import '../../models/role.dart';
import '../../models/me.dart';
import '../../models/sale.dart';
import 'bill_view.dart';
import 'sale_sheet.dart';
import 'share_buttons.dart';

/// One bill: the bill itself, sharing, and Edit for the barber's own bills of today (the server refuses older ones).
Future<void> openBill(BuildContext context, {required Me me, required SalesApi sales, required Sale sale}) =>
    Navigator.of(context).push<void>(SkRoute(builder: (_) => BillScreen(me: me, sales: sales, sale: sale)));

class BillScreen extends StatefulWidget {
  const BillScreen({super.key, required this.me, required this.sales, required this.sale});
  final Me me;
  final SalesApi sales;
  final Sale sale;

  @override
  State<BillScreen> createState() => _BillScreenState();
}

class _BillScreenState extends State<BillScreen> {
  late Sale _sale = widget.sale;

  bool get _admin => widget.me.role == Role.admin;

  /// Admins edit any bill; a barber only their own from today (the server enforces the same).
  bool get _canEdit => !widget.me.readOnly && (_admin || (_sale.day == widget.me.today && _sale.barberId == widget.me.user.id));

  Future<void> _edit() async {
    final r = await openSaleSheet(context,
        me: widget.me, sales: widget.sales, staff: _admin ? StaffApi(widget.sales.api) : null, existing: _sale, doneActions: shareActionsFor);
    if (!mounted || r == null) return;
    if (r.deleted) return Navigator.of(context).pop();
    setState(() => _sale = r.sale!);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text(_sale.billNo),
          actions: [if (_canEdit) TextButton.icon(onPressed: _edit, icon: const Icon(Icons.edit_outlined), label: const Text('Edit'))],
        ),
        body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
          BillView(sale: _sale, settings: widget.me.salon, fmt: widget.me.fmt, slug: widget.me.org.slug),
        ]),
        // Sharing stays under the thumb, however long the bill is.
        bottomNavigationBar: SafeArea(
          child: Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 12), child: shareActionsFor(context, _sale)),
        ),
      );
}
