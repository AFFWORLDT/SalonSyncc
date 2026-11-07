import 'package:flutter/material.dart';

import '../theme/scale.dart';
import 'haptics.dart';

enum ToastKind { info, success, error }

/// One toast style for the whole app: floating, an icon for the kind, a haptic, and an optional Undo.
void showSkToast(BuildContext context, String message, {ToastKind kind = ToastKind.info, VoidCallback? onUndo}) {
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  final cs = Theme.of(context).colorScheme;
  final p = skPalette(context);
  switch (kind) {
    case ToastKind.success:
      Haptic.success();
    case ToastKind.error:
      Haptic.error();
    case ToastKind.info:
      break;
  }
  final (icon, color) = switch (kind) {
    ToastKind.success => (Icons.check_circle_rounded, p.success),
    ToastKind.error => (Icons.error_rounded, cs.error),
    ToastKind.info => (Icons.info_outline_rounded, cs.onInverseSurface),
  };
  m
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      behavior: SnackBarBehavior.floating,
      margin: const EdgeInsets.fromLTRB(SkSpace.gutter, 0, SkSpace.gutter, SkSpace.md),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(SkRadius.md)),
      duration: Duration(milliseconds: onUndo != null ? 5000 : 3000),
      content: Row(children: [
        Icon(icon, color: color, size: 20),
        const SizedBox(width: SkSpace.md),
        Expanded(child: Text(message)),
      ]),
      action: onUndo == null ? null : SnackBarAction(label: 'Undo', onPressed: onUndo),
    ));
}
