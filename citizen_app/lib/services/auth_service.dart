import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_client.dart';


class AuthService {

  static User? get currentUser => supabase.auth.currentUser;


  //  REGISTER
  static Future<String?> register({
  required String email,
  required String password,
  required String name,
  required String age,
}) async {
  try {
    final res = await Supabase.instance.client.auth.signUp(
      email: email,
      password: password,
    );

    final user = res.user;


    if (user == null) {
      return "Signup failed";
    }

    //  INSERT INTO PROFILES TABLE
    await Supabase.instance.client.from('profiles').upsert({
  "id": user.id,
  "name": name,
  "age": int.tryParse(age),
  "email": email,
  "latitude": null,
  "longitude": null,
});

    return null; 

  } catch (e) {
    return e.toString();
  }
}
static Future<void> updateUserLocation({
  required double lat,
  required double lng,
}) async {
  final user = currentUser;
  if (user == null) return;

  try {
    await Supabase.instance.client
        .from('profiles')
        .update({
          "latitude": lat,
          "longitude": lng,
        })
        .eq('id', user.id);

    print("✅ Location updated");
  } catch (e) {
    print("❌ Location update error: $e");
  }
}
  //  LOGIN
  static Future<String?> login({
    required String email,
    required String password,
  }) async {
    try {
      await supabase.auth.signInWithPassword(
        email: email,
        password: password,
      );

      return null;
    } catch (e) {
      return "Invalid email or password";
    }
  }

  //  LOGOUT
  static Future<void> logout() async {
    await supabase.auth.signOut();
  }
}