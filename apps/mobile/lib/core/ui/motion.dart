import 'package:flutter/widgets.dart';

/// App motion is short (150–350 ms) and off when the phone asks for reduced motion.
Duration skDuration(BuildContext context, [int ms = 250]) =>
    MediaQuery.maybeDisableAnimationsOf(context) ?? false ? Duration.zero : Duration(milliseconds: ms);
