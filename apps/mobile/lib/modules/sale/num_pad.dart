import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/ui/haptics.dart';

/// Pad keys: digits, "00", ".", backspace and clear.
const kBackspace = '⌫', kClear = 'C';

/// The new text of a money field after a pad key (a port of the web's lib/numpad.ts). [fresh]: the field was just
/// picked, so the first digit or dot replaces the old value, as if it were highlighted. [decimals] is the currency's.
String applyKey(String value, String key, {required int decimals, bool fresh = false, int maxWhole = 6}) {
  if (key == kClear) return '';
  if (key == kBackspace) return value.isEmpty ? value : value.substring(0, value.length - 1);
  final base = fresh ? '' : value;
  if (key == '.') {
    if (decimals == 0 || base.contains('.')) return base.isEmpty ? value : base;
    return base.isEmpty ? '0.' : '$base.';
  }
  if (!RegExp(r'^\d+$').hasMatch(key)) return value;
  var out = base;
  for (final d in key.split('')) {
    final parts = out.split('.');
    final whole = parts[0];
    if (parts.length > 1) {
      if (parts[1].length >= decimals) break;
      out += d;
    } else if (whole == '0' || whole.isEmpty) {
      out = d == '0' && whole == '0' ? '0' : d;
    } else if (whole.length < maxWhole) {
      out += d;
    }
  }
  return out;
}

/// The till's number pad: always on screen while a bill is made, so the phone keyboard never opens for numbers and
/// nothing jumps. Every key ticks. [action] is the tall key on the right (Next).
class NumPad extends StatelessWidget {
  const NumPad({super.key, required this.onKey, required this.action, this.dot = true});
  final ValueChanged<String> onKey;
  final Widget action;

  /// Off for currencies without decimals.
  final bool dot;

  static const _rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', '00'],
  ];

  @override
  Widget build(BuildContext context) {
    const gap = 8.0, h = 50.0;
    Widget key(String k) => Expanded(child: _PadKey(label: k, enabled: k != '.' || dot, onTap: () => onKey(k)));
    Widget row(List<Widget> c) => SizedBox(height: h, child: Row(children: [for (var i = 0; i < c.length; i++) ...[if (i > 0) const SizedBox(width: gap), c[i]]]));
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
        flex: 3,
        child: Column(children: [
          for (var r = 0; r < _rows.length; r++) ...[if (r > 0) const SizedBox(height: gap), row([for (final k in _rows[r]) key(k)])],
        ]),
      ),
      const SizedBox(width: gap),
      Expanded(
        child: Column(children: [
          SizedBox(height: h, child: _PadKey(label: kBackspace, icon: Icons.backspace_outlined, onTap: () => onKey(kBackspace))),
          const SizedBox(height: gap),
          SizedBox(height: h, child: _PadKey(label: kClear, muted: true, onTap: () => onKey(kClear))),
          const SizedBox(height: gap),
          SizedBox(height: h * 2 + gap, child: action),
        ]),
      ),
    ]);
  }
}

class _PadKey extends StatelessWidget {
  const _PadKey({required this.label, required this.onTap, this.icon, this.muted = false, this.enabled = true});
  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool muted, enabled;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final fg = muted || icon != null ? cs.onSurfaceVariant : cs.onSurface;
    return Material(
      color: cs.surfaceContainerHighest.withValues(alpha: 0.7),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        key: ValueKey('pad-$label'),
        borderRadius: BorderRadius.circular(14),
        onTapDown: enabled ? (_) => Haptic.tap() : null,
        onTap: enabled ? onTap : null,
        child: Center(
          child: Opacity(
            opacity: enabled ? 1 : 0.3,
            child: icon != null
                ? Icon(icon, size: 22, color: fg, semanticLabel: 'Backspace')
                : Text(label, style: SkText.mono.copyWith(fontSize: muted ? 18 : 24, fontWeight: FontWeight.w600, color: fg)),
          ),
        ),
      ),
    );
  }
}
