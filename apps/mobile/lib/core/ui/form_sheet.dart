import 'package:flutter/material.dart';

import 'states.dart';

/// A bottom-sheet form: title, description, fields, the server's error, buttons. [run] guards double taps, shows the
/// server's words on failure (the sheet stays open with the input kept) and closes with [toast] on success.
class FormSheet extends StatelessWidget {
  const FormSheet({super.key, required this.title, this.subtitle, required this.fields, required this.actions, this.error});
  final String title;
  final String? subtitle, error;
  final List<Widget> fields, actions;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    // Fields scroll; the title stays on top and the buttons stay pinned above the keyboard.
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.88),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              if (subtitle != null) ...[const SizedBox(height: 4), Text(subtitle!, style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant))],
            ]),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: fields),
            ),
          ),
          Container(
            decoration: BoxDecoration(border: Border(top: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.5)))),
            padding: EdgeInsets.fromLTRB(20, 10, 20, 12 + (MediaQuery.viewInsetsOf(context).bottom > 0 ? 0 : MediaQuery.paddingOf(context).bottom)),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (error != null)
                Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(error!, style: TextStyle(color: cs.error, fontWeight: FontWeight.w500))),
              Row(children: [
                for (var i = 0; i < actions.length; i++) ...[
                  if (i > 0) const SizedBox(width: 10),
                  Expanded(child: SizedBox(height: 50, child: actions[i])),
                ],
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Shared busy / error state for a form sheet's save buttons.
mixin FormSheetState<T extends StatefulWidget> on State<T> {
  bool busy = false;
  String? error;

  /// Runs [call]; on success pops the sheet with [toast], on failure shows the server's words and stays open.
  Future<void> run(Future<void> Function() call, String toast) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await call();
      if (mounted) Navigator.of(context).pop(toast);
    } catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          error = messageOf(e);
        });
      }
    }
  }
}

/// Opens a form sheet; resolves with the toast to show (null when closed without saving).
Future<String?> showFormSheet(BuildContext context, WidgetBuilder builder) =>
    showModalBottomSheet<String>(context: context, isScrollControlled: true, useSafeArea: true, showDragHandle: true, builder: builder);
