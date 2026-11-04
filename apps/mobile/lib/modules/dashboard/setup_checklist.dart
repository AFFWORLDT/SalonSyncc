import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/ui/glass.dart';
import '../../models/setup.dart';

/// "Get your salon ready": the first-run steps, until all are done or the admin hides the card (per salon).
class SetupChecklist extends StatefulWidget {
  const SetupChecklist({super.key, required this.slug, required this.setup, required this.withRatings});
  final String slug;
  final SetupState setup;
  final bool withRatings;

  @override
  State<SetupChecklist> createState() => _SetupChecklistState();
}

class _SetupChecklistState extends State<SetupChecklist> {
  bool? _hidden;
  String get _key => 'sk.setup.dismissed.${widget.slug}';

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) => mounted ? setState(() => _hidden = p.getBool(_key) ?? false) : null, onError: (_) {
      if (mounted) setState(() => _hidden = false);
    });
  }

  Future<void> _hide() async {
    setState(() => _hidden = true);
    try {
      (await SharedPreferences.getInstance()).setBool(_key, true);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.setup;
    final steps = [
      ('Upload your salon logo', s.logo),
      ('Add your services and prices', s.services),
      ('Add your staff', s.staff),
      ('Set up VAT on bills', s.vat),
      if (widget.withRatings) ('Add your Google review link', s.googleReview),
    ];
    final done = steps.where((x) => x.$2).length;
    if (_hidden != false || done == steps.length) return const SizedBox.shrink();
    final t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SkGlass(blur: false, 
        padding: const EdgeInsets.fromLTRB(16, 10, 6, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('Get your salon ready', style: t.titleSmall?.copyWith(fontWeight: FontWeight.w600))),
            Text('$done of ${steps.length} done', style: t.bodySmall),
            IconButton(tooltip: 'Hide', onPressed: _hide, icon: const Icon(Icons.close_rounded, size: 20)),
          ]),
          for (final (label, ok) in steps)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(children: [
                Icon(ok ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, size: 20, color: ok ? cs.primary : cs.onSurfaceVariant),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(label, style: t.bodyMedium?.copyWith(decoration: ok ? TextDecoration.lineThrough : null, color: ok ? cs.onSurfaceVariant : null)),
                ),
              ]),
            ),
        ]),
      ),
    );
  }
}
