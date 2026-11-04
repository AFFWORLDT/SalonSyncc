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
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            if (subtitle != null) ...[const SizedBox(height: 4), Text(subtitle!, style: Theme.of(context).textTheme.bodySmall)],
            const SizedBox(height: 16),
            ...fields,
            if (error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
            const SizedBox(height: 12),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [for (final a in actions) Padding(padding: const EdgeInsets.only(left: 8), child: a)]),
          ]),
        ),
      );
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
    showModalBottomSheet<String>(context: context, isScrollControlled: true, showDragHandle: true, builder: builder);
