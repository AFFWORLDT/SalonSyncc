import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/motion.dart';
import '../../core/ui/states.dart';
import '../../data/sales_api.dart';
import '../../models/sale.dart';
import 'customer_step.dart' show phoneForApi;

/// One "Choose customer" control for the sale (FM's picker): a dropdown with recent customers, a search to find any
/// saved one, and "Add new customer" to type a name and mobile on the way. It fills the sale's [name] and [phone];
/// the customer is saved with the bill.
class CustomerPicker extends StatefulWidget {
  const CustomerPicker({super.key, required this.sales, required this.name, required this.phone, required this.phoneCountry, this.formatPhone});
  final SalesApi sales;
  final TextEditingController name, phone;
  final String phoneCountry;
  final String Function(String)? formatPhone;

  @override
  State<CustomerPicker> createState() => _CustomerPickerState();
}

class _CustomerPickerState extends State<CustomerPicker> {
  final _q = TextEditingController();
  bool _open = false, _adding = false;

  /// The saved customer being edited in place (name and mobile), or null.
  CustomerHint? _editing;
  final _editName = TextEditingController(), _editPhone = TextEditingController();
  bool _saving = false;
  String? _editError;
  List<CustomerHint>? _hints;
  String? _phoneError;
  Timer? _debounce;
  int _seq = 0;

  bool get _has => widget.name.text.trim().isNotEmpty || widget.phone.text.trim().isNotEmpty;

  @override
  void initState() {
    super.initState();
    _q.addListener(_typed);
    _lookup('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    _editName.dispose();
    _editPhone.dispose();
    super.dispose();
  }

  String _last = '';
  void _typed() {
    final q = _q.text.trim();
    if (q == _last) return;
    _last = q;
    _debounce?.cancel();
    setState(() {});
    if (q.isNotEmpty && q.length < 2) return;
    _debounce = Timer(const Duration(milliseconds: 200), () => _lookup(q));
  }

  Future<void> _lookup(String q) async {
    final n = ++_seq;
    try {
      final h = await widget.sales.customers(q);
      if (mounted && n == _seq) setState(() => _hints = h);
    } catch (_) {
      // Suggestions are a convenience; a failed lookup just shows none.
      if (mounted && n == _seq) setState(() => _hints = const []);
    }
  }

  void _toggle() {
    Haptic.tap();
    setState(() {
      _open = !_open;
      _adding = false;
      _editing = null;
      if (!_open) _q.clear();
    });
    if (!_open) FocusScope.of(context).unfocus();
  }

  void _choose(CustomerHint h) {
    Haptic.select();
    widget.name.text = h.name;
    widget.phone.text = h.phone ?? '';
    _close();
  }

  void _startAdd() {
    Haptic.select();
    // Prefill from the search: digits → mobile, text → name.
    final t = _q.text.trim();
    final digits = t.replaceAll(RegExp(r'\D'), '');
    if (t.isNotEmpty && digits.length >= 4 && digits.length >= t.replaceAll(RegExp(r'\s'), '').length - 1) {
      if (widget.phone.text.trim().isEmpty) widget.phone.text = t;
    } else if (t.isNotEmpty && widget.name.text.trim().isEmpty) {
      widget.name.text = t;
    }
    setState(() { _adding = true; _phoneError = null; });
  }

  void _doneAdding() {
    try {
      phoneForApi(widget.phone.text, widget.phoneCountry);
    } on FormatException catch (e) {
      Haptic.error();
      return setState(() => _phoneError = e.message);
    }
    Haptic.select();
    _close();
  }

  void _startEdit(CustomerHint h) {
    Haptic.select();
    _editName.text = h.name;
    _editPhone.text = h.phone == null ? '' : (widget.formatPhone?.call(h.phone!) ?? h.phone!);
    setState(() {
      _editing = h;
      _editError = null;
    });
  }

  /// Saves the edit for the whole salon; if this customer is the one on the bill, the bill follows.
  Future<void> _saveEdit() async {
    final h = _editing;
    if (h == null || _saving) return;
    if (_editName.text.trim().isEmpty && _editPhone.text.trim().isEmpty) {
      return setState(() => _editError = 'Enter a name or a mobile');
    }
    try {
      phoneForApi(_editPhone.text, widget.phoneCountry);
    } on FormatException catch (e) {
      Haptic.error();
      return setState(() => _editError = e.message);
    }
    setState(() {
      _saving = true;
      _editError = null;
    });
    try {
      final saved = await widget.sales.updateCustomer(h.id, name: _editName.text, phone: _editPhone.text);
      if (!mounted) return;
      final onBill = widget.name.text.trim() == h.name.trim() && widget.phone.text.replaceAll(RegExp(r'\D'), '') == (h.phone ?? '').replaceAll(RegExp(r'\D'), '');
      if (onBill) {
        widget.name.text = saved.name;
        widget.phone.text = saved.phone ?? '';
      }
      Haptic.success();
      setState(() {
        _editing = null;
        _hints = [for (final x in _hints ?? const <CustomerHint>[]) x.id == saved.id ? saved : x];
      });
    } catch (e) {
      Haptic.error();
      if (mounted) setState(() => _editError = messageOf(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _close() {
    FocusScope.of(context).unfocus();
    setState(() {
      _open = false;
      _adding = false;
      _editing = null;
      _phoneError = null;
      _q.clear();
    });
  }

  void _clear() {
    Haptic.select();
    widget.name.clear();
    widget.phone.clear();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final name = widget.name.text.trim(), phone = widget.phone.text.trim();
    final shownPhone = phone.isEmpty ? '' : (widget.formatPhone?.call(phone) ?? phone);
    final radius = BorderRadius.circular(16);
    return AnimatedContainer(
      duration: skDuration(context, 150),
      decoration: BoxDecoration(borderRadius: radius, border: Border.all(color: _open ? cs.primary : cs.outlineVariant, width: _open ? 1.5 : 1)),
      child: ClipRRect(
        borderRadius: radius,
        child: Material(
          type: MaterialType.transparency,
          child: Column(children: [
            // The trigger.
            InkWell(
              key: const ValueKey('customer-picker'),
              onTap: _toggle,
              child: SizedBox(
                height: 56,
                child: Row(children: [
                  const SizedBox(width: 14),
                  Icon(Icons.person_outline_rounded, color: cs.onSurfaceVariant),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _has
                        ? Row(children: [
                            Flexible(child: Text(name.isEmpty ? 'No name' : name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                            if (shownPhone.isNotEmpty) ...[
                              const SizedBox(width: 8),
                              Text(shownPhone, style: SkText.mono.copyWith(fontSize: 12.5, color: cs.onSurfaceVariant)),
                            ],
                          ])
                        : Text('Choose customer', style: TextStyle(fontSize: 15, color: cs.onSurfaceVariant)),
                  ),
                  if (_has && !_open)
                    IconButton(key: const ValueKey('customer-clear'), tooltip: 'Clear customer', onPressed: _clear, icon: const Icon(Icons.close_rounded, size: 20))
                  else
                    Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: AnimatedRotation(turns: _open ? 0.5 : 0, duration: skDuration(context, 150), child: Icon(Icons.keyboard_arrow_down_rounded, color: cs.onSurfaceVariant)),
                    ),
                ]),
              ),
            ),
            // The dropdown.
            AnimatedSize(
              duration: skDuration(context, 180),
              curve: Curves.easeOutCubic,
              alignment: Alignment.topCenter,
              child: !_open ? const SizedBox(width: double.infinity) : (_editing != null ? _editForm(context) : (_adding ? _addForm(context) : _list(context))),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _list(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final q = _q.text.trim();
    final hints = _hints;
    final divider = Divider(height: 1, color: cs.outlineVariant.withValues(alpha: 0.6));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      divider,
      TextField(
        key: const ValueKey('customer-search'),
        controller: _q,
        autofocus: true,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          hintText: 'Search name or mobile',
          prefixIcon: const Icon(Icons.search_rounded),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          filled: false,
          suffixIcon: q.isEmpty ? null : IconButton(tooltip: 'Clear search', onPressed: _q.clear, icon: const Icon(Icons.close_rounded, size: 18)),
        ),
      ),
      divider,
      InkWell(
        key: const ValueKey('customer-add'),
        onTap: _startAdd,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(children: [
            CircleAvatar(radius: 14, backgroundColor: cs.primary.withValues(alpha: 0.14), child: Icon(Icons.add_rounded, size: 18, color: cs.primary)),
            const SizedBox(width: 12),
            Expanded(child: Text(q.isEmpty ? 'Add new customer' : 'Add “$q”', style: TextStyle(color: cs.primary, fontWeight: FontWeight.w600))),
          ]),
        ),
      ),
      divider,
      ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 264),
        child: hints == null
            ? Padding(
                padding: const EdgeInsets.all(10),
                child: Column(children: [for (var i = 0; i < 3; i++) const Padding(padding: EdgeInsets.symmetric(vertical: 3), child: SkSkeleton(height: 40))]),
              )
            : hints.isEmpty
                ? Padding(padding: const EdgeInsets.all(18), child: Text('No saved customer found.', textAlign: TextAlign.center, style: TextStyle(color: cs.onSurfaceVariant)))
                : ListView(shrinkWrap: true, padding: const EdgeInsets.symmetric(vertical: 4), children: [
                    if (q.isEmpty)
                      Padding(padding: const EdgeInsets.fromLTRB(14, 6, 14, 2), child: Text('Recent customers', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: cs.onSurfaceVariant))),
                    for (final h in hints)
                      InkWell(
                        key: ValueKey('customer-hint-${h.id}'),
                        onTap: () => _choose(h),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(14, 2, 4, 2),
                          child: Row(children: [
                            Icon(Icons.person_outline_rounded, size: 20, color: cs.onSurfaceVariant),
                            const SizedBox(width: 12),
                            Expanded(child: Text(h.name.isEmpty ? 'No name' : h.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w500))),
                            if (h.phone != null)
                              Text(widget.formatPhone?.call(h.phone!) ?? h.phone!, style: SkText.mono.copyWith(fontSize: 12, color: cs.onSurfaceVariant))
                            else
                              Text('No mobile', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant.withValues(alpha: 0.7))),
                            IconButton(
                              key: ValueKey('customer-edit-${h.id}'),
                              tooltip: 'Edit customer',
                              visualDensity: VisualDensity.compact,
                              onPressed: () => _startEdit(h),
                              icon: Icon(Icons.edit_outlined, size: 18, color: cs.primary),
                            ),
                          ]),
                        ),
                      ),
                  ]),
      ),
    ]);
  }

  Widget _addForm(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Divider(height: 1, color: cs.outlineVariant.withValues(alpha: 0.6)),
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 4, 14, 0),
        child: Row(children: [
          IconButton(tooltip: 'Back', onPressed: () => setState(() => _adding = false), icon: const Icon(Icons.arrow_back_rounded, size: 20)),
          const Text('New customer', style: TextStyle(fontWeight: FontWeight.w600)),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(14, 4, 14, 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(
            key: const ValueKey('customer-name'),
            controller: widget.name,
            autofocus: widget.name.text.isEmpty,
            textCapitalization: TextCapitalization.words,
            maxLength: 80,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Name (optional)', counterText: ''),
          ),
          const SizedBox(height: 10),
          TextField(
            key: const ValueKey('customer-phone'),
            controller: widget.phone,
            keyboardType: TextInputType.phone,
            onChanged: (_) => _phoneError == null ? null : setState(() => _phoneError = null),
            onSubmitted: (_) => _doneAdding(),
            decoration: InputDecoration(labelText: 'Mobile (optional)', hintText: 'Local number, or with + and country code', errorText: _phoneError),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            key: const ValueKey('customer-add-done'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: _doneAdding,
            icon: const Icon(Icons.person_add_alt_1_rounded),
            label: const Text('Add customer'),
          ),
        ]),
      ),
    ]);
  }

  Widget _editForm(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Divider(height: 1, color: cs.outlineVariant.withValues(alpha: 0.6)),
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 4, 14, 0),
        child: Row(children: [
          IconButton(tooltip: 'Back', onPressed: () => setState(() => _editing = null), icon: const Icon(Icons.arrow_back_rounded, size: 20)),
          const Expanded(child: Text('Edit customer', style: TextStyle(fontWeight: FontWeight.w600))),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(14, 4, 14, 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(
            key: const ValueKey('customer-edit-name'),
            controller: _editName,
            textCapitalization: TextCapitalization.words,
            maxLength: 80,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Name', counterText: ''),
          ),
          const SizedBox(height: 10),
          TextField(
            key: const ValueKey('customer-edit-phone'),
            controller: _editPhone,
            autofocus: _editPhone.text.isEmpty,
            keyboardType: TextInputType.phone,
            onSubmitted: (_) => _saveEdit(),
            decoration: InputDecoration(labelText: 'Mobile', hintText: 'Local number, or with + and country code', errorText: _editError),
          ),
          const SizedBox(height: 6),
          Text('Saved for everyone in the salon.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          const SizedBox(height: 10),
          FilledButton.icon(
            key: const ValueKey('customer-edit-save'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: _saving ? null : _saveEdit,
            icon: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check_rounded),
            label: const Text('Save customer'),
          ),
        ]),
      ),
    ]);
  }
}
