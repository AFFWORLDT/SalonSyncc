import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// The deep greens and mint of the premium screens (the same in light and dark).
const kSkDeep = Color(0xFF0E5A48), kSkDeeper = Color(0xFF0A3E32), kSkMint = Color(0xFF7FE3B0), kSkGold = Color(0xFFD9A14E);

/// A tall deep green pill ("+ New sale").
class SkGreenButton extends StatelessWidget {
  const SkGreenButton({super.key, required this.label, required this.onPressed, this.icon = Icons.add_rounded, this.height = 58});
  final String label;
  final IconData icon;
  final VoidCallback onPressed;
  final double height;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: const LinearGradient(colors: [kSkDeep, kSkDeeper]),
          boxShadow: const [BoxShadow(color: Color(0x400A3E32), blurRadius: 18, offset: Offset(0, 8), spreadRadius: -6)],
        ),
        child: FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            foregroundColor: Colors.white,
            minimumSize: Size.fromHeight(height),
            shape: const StadiumBorder(),
            textStyle: const TextStyle(fontFamily: kTextFont, fontSize: 17, fontWeight: FontWeight.w700),
          ),
          onPressed: onPressed,
          icon: Icon(icon, size: 24),
          label: Text(label),
        ),
      );
}

/// A white card with a soft shadow and big rounded corners.
class SkSoftCard extends StatelessWidget {
  const SkSoftCard({super.key, required this.child, this.onTap, this.padding = EdgeInsets.zero, this.radius = 22});
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final inner = Padding(padding: padding, child: child);
    return Container(
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: dark ? 0.6 : 0.35)),
        boxShadow: dark ? null : const [BoxShadow(color: Color(0x0F1C1B18), blurRadius: 16, offset: Offset(0, 6))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(type: MaterialType.transparency, child: onTap == null ? inner : InkWell(onTap: onTap, child: inner)),
    );
  }
}
