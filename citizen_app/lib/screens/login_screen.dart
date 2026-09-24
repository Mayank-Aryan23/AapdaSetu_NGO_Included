import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../widgets/bottom_nav.dart';
import 'signup_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {

  final emailController = TextEditingController();
  final passwordController = TextEditingController();

  bool loading = false;

  //  LOGIN FUNCTION
  Future<void> login() async {
    setState(() => loading = true);

    final error = await AuthService.login(
      email: emailController.text.trim(),
      password: passwordController.text.trim(),
    );

    

    setState(() => loading = false);

    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error)),
      );
      return;
    }

    if (!mounted) return;

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const MainNavigation()),
    );
  }

  
  

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [

            const Icon(Icons.shield, size: 80, color: Colors.red),

            const SizedBox(height: 20),

            const Text(
              "AapdaSetu",
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),

            const SizedBox(height: 30),

            //  EMAIL
            TextField(
              controller: emailController,
              decoration: const InputDecoration(hintText: "Email"),
            ),

            const SizedBox(height: 10),

            //  PASSWORD
            TextField(
              controller: passwordController,
              obscureText: true,
              decoration: const InputDecoration(hintText: "Password"),
            ),

            const SizedBox(height: 20),

            //  LOGIN BUTTON
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: loading ? null : login,
                child: loading
                    ? const CircularProgressIndicator()
                    : const Text("LOGIN"),
              ),
            ),

            const SizedBox(height: 10),

            //  RESEND EMAIL
            

            //  CHECK STATUS
            
            const SizedBox(height: 10),

TextButton(
  onPressed: () {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const SignupScreen(),
      ),
    );
  },
  child: const Text("Create new account"),
),
          ],
        ),
      ),
    );
  }
}