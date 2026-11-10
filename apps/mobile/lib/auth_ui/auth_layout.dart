import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/config.dart';

/// The sign-in screens' shared look: the salon photo with a headline, a rounded sheet that rises over it, and a badge
/// (SalonKit's logo or the salon's) sitting on the seam.
class SkAuthLayout extends StatelessWidget {
  const SkAuthLayout({super.key, required this.badge, required this.child, this.headline = 'Your salon.\nSmarter.', this.tagline = 'Bills, staff and daily reports, all in one app.', this.back});
  final Widget badge;

  /// A round back button on the photo; null = shown whenever there is a screen to go back to.
  final bool? back;
  final Widget child;
  final String headline, tagline;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light, // white status bar over the dark photo
      child: Scaffold(
        backgroundColor: c.surface,
        body: SingleChildScrollView(
          child: Column(children: [
            _Hero(headline: headline, tagline: tagline, back: back ?? Navigator.of(context).canPop()),
            Transform.translate(
              offset: const Offset(0, -32),
              child: Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
                Container(
                  width: double.infinity,
                  decoration: BoxDecoration(color: c.surface, borderRadius: const BorderRadius.vertical(top: Radius.circular(32))),
                  padding: EdgeInsets.fromLTRB(24, 52, 24, 24 + MediaQuery.paddingOf(context).bottom),
                  child: child,
                ),
                Positioned(top: -36, child: _Badge(child: badge)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/// The salon photo with the headline on a dark green wash (dark in both themes, so the text stays white).
class _Hero extends StatelessWidget {
  const _Hero({required this.headline, required this.tagline, this.back = false});
  final String headline, tagline;
  final bool back;
  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return SizedBox(
      height: 250 + top,
      width: double.infinity,
      child: Stack(fit: StackFit.expand, children: [
        Image.asset('assets/brand/sign-in-hero.jpg', fit: BoxFit.cover, alignment: const Alignment(0.5, 0)),
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [Color(0xF2031D17), Color(0xBF04241D), Color(0x0004241D)], stops: [0, 0.5, 1]),
          ),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(24, top + 20, 24, 0),
          child: FractionallySizedBox(
            widthFactor: 0.66,
            alignment: Alignment.topLeft,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                if (back) ...[
                  Material(
                    color: Colors.white.withValues(alpha: 0.16),
                    shape: const CircleBorder(),
                    child: IconButton(
                      key: const ValueKey('auth-back'),
                      tooltip: 'Back',
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                const SkWordmark(color: Colors.white, size: 17),
              ]),
              const SizedBox(height: 16),
              Text(headline, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 28, height: 1.12, fontWeight: FontWeight.w800, letterSpacing: -0.6)),
              const SizedBox(height: 10),
              Text(tagline, style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontSize: 13, height: 1.35, fontWeight: FontWeight.w500)),
            ]),
          ),
        ),
      ]),
    );
  }
}

/// "SalonKit" with the gold spark.
class SkWordmark extends StatelessWidget {
  const SkWordmark({super.key, required this.color, required this.size});
  final Color color;
  final double size;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('SalonKit', style: TextStyle(color: color, fontSize: size, fontWeight: FontWeight.w700, letterSpacing: -0.3)),
        Icon(Icons.auto_awesome, size: size * 0.6, color: const Color(0xFFE6A852)),
      ]);
}

/// A 72px circle with a ring in the sheet's colour, so the badge looks cut into the seam.
class _Badge extends StatelessWidget {
  const _Badge({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
        width: 72,
        height: 72,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Theme.of(context).colorScheme.surface,
          border: Border.all(color: Theme.of(context).colorScheme.surface, width: 3.5),
          boxShadow: const [BoxShadow(color: Color(0x26000000), blurRadius: 14, offset: Offset(0, 4))],
        ),
        child: ClipOval(child: child),
      );
}

/// The screen's title and the line under it.
class SkAuthTitle extends StatelessWidget {
  const SkAuthTitle({super.key, required this.title, required this.subtitle});
  final String title, subtitle;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, c = Theme.of(context).colorScheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(title, textAlign: TextAlign.center, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.4)),
      const SizedBox(height: 6),
      Text(subtitle, textAlign: TextAlign.center, style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
    ]);
  }
}

/// A divider with a small uppercase pill in the middle ("OR USE YOUR EMAIL").
class SkPillDivider extends StatelessWidget {
  const SkPillDivider(this.label, {super.key});
  final String label;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, c = Theme.of(context).colorScheme;
    return Stack(alignment: Alignment.center, children: [
      const Divider(),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        decoration: BoxDecoration(color: c.surfaceContainerHighest, borderRadius: BorderRadius.circular(999)),
        child: Text(label.toUpperCase(), style: t.labelSmall?.copyWith(color: c.onSurfaceVariant, fontWeight: FontWeight.w700, letterSpacing: 0.8)),
      ),
    ]);
  }
}

/// A bold label above a field.
class SkFieldLabel extends StatelessWidget {
  const SkFieldLabel(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.only(left: 4, bottom: 6), child: Text(text, style: Theme.of(context).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700)));
}

/// A rounded (pill) field: optional icon on the left, the primary colour when focused.
InputDecoration skPillDecoration(BuildContext context, {String? hint, IconData? icon, Widget? suffix, TextStyle? hintStyle}) {
  final c = Theme.of(context).colorScheme;
  final pill = OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide(color: c.outlineVariant));
  return InputDecoration(
    hintText: hint,
    hintStyle: hintStyle,
    prefixIcon: icon == null ? null : Padding(padding: const EdgeInsets.only(left: 6), child: Icon(icon, size: 20)),
    suffixIcon: suffix == null ? null : Padding(padding: const EdgeInsets.only(right: 6), child: suffix),
    counterText: '',
    fillColor: c.surface,
    contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 18),
    border: pill,
    enabledBorder: pill,
    focusedBorder: pill.copyWith(borderSide: BorderSide(color: c.primary, width: 1.6)),
  );
}

/// The main action: a full-width pill with an arrow and a soft shadow in the primary colour.
class SkPrimaryPill extends StatelessWidget {
  const SkPrimaryPill({super.key, required this.label, required this.onPressed, this.busy = false});
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, c = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        boxShadow: [BoxShadow(color: c.primary.withValues(alpha: dark ? 0.25 : 0.32), blurRadius: 20, offset: const Offset(0, 8), spreadRadius: -6)],
      ),
      child: FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), shape: const StadiumBorder(), textStyle: t.labelLarge?.copyWith(fontSize: 15, fontWeight: FontWeight.w600)),
        onPressed: busy ? null : onPressed,
        child: busy
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
            : Row(mainAxisSize: MainAxisSize.min, children: [Text(label), const SizedBox(width: 8), const Icon(Icons.arrow_forward_rounded, size: 18)]),
      ),
    );
  }
}

/// A small grey note with an icon in front ("We'll email a 6-digit code…").
class SkNote extends StatelessWidget {
  const SkNote({super.key, required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme, c = Theme.of(context).colorScheme;
    return Row(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.only(top: 1), child: Icon(icon, size: 16, color: c.onSurfaceVariant)),
      const SizedBox(width: 6),
      Flexible(child: Text(text, style: t.bodySmall?.copyWith(color: c.onSurfaceVariant))),
    ]);
  }
}

/// A soft sage pill that leads somewhere else ("New salon? Create your salon").
class SkSoftPill extends StatelessWidget {
  const SkSoftPill({super.key, required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = dark ? c.onSurface : const Color(0xFF0E523F);
    return Material(
      color: Colors.transparent,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          gradient: LinearGradient(colors: dark ? [c.primary.withValues(alpha: 0.16), c.primary.withValues(alpha: 0.28)] : const [Color(0xFFE7F5EC), Color(0xFFD8F0E2)]),
          border: Border.all(color: dark ? c.primary.withValues(alpha: 0.35) : const Color(0xFFD2EDD9)),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: SizedBox(
            height: 54,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(icon, size: 22, color: fg),
                const SizedBox(width: 10),
                Flexible(child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.onSurface))),
                const SizedBox(width: 6),
                Icon(Icons.arrow_forward_rounded, size: 18, color: fg),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

/// "By continuing you agree to our Terms and Privacy Policy", linking to the site.
class SkLegal extends StatelessWidget {
  const SkLegal({super.key});
  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final style = Theme.of(context).textTheme.bodySmall?.copyWith(color: c.onSurfaceVariant);
    final link = style?.copyWith(decoration: TextDecoration.underline, color: c.onSurface);
    Widget a(String label, String path) => GestureDetector(
          onTap: () => launchUrl(Uri.https(kRootDomain, path), mode: LaunchMode.externalApplication),
          child: Text(label, style: link),
        );
    return Wrap(alignment: WrapAlignment.center, children: [
      Text('By continuing you agree to our ', style: style),
      a('Terms', '/terms/'),
      Text(' and ', style: style),
      a('Privacy Policy', '/privacy/'),
      Text('.', style: style),
    ]);
  }
}
