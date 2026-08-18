package com.nexora.controller;

import com.nexora.config.JwtUtil;
import com.nexora.dto.LoginRequest;
import com.nexora.dto.RegisterRequest;
import com.nexora.model.User;
import com.nexora.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationManager authManager;
    private final UserService userService;
    private final JwtUtil jwtUtil;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest req) {
        try {
            User user = userService.register(req);
            String token = jwtUtil.generateToken(user.getEmail());
            return ResponseEntity.ok(buildSession(token, user));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req) {
        try {
            authManager.authenticate(
                new UsernamePasswordAuthenticationToken(req.getEmail(), req.getPassword())
            );
            User user = userService.findByEmail(req.getEmail());
            String token = jwtUtil.generateToken(user.getEmail());
            return ResponseEntity.ok(buildSession(token, user));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", "Credenciais inválidas"));
        }
    }

    private java.util.HashMap<String, Object> buildSession(String token, User user) {
        java.util.HashMap<String, Object> map = new java.util.HashMap<>();
        map.put("token", token);
        map.put("id", user.getId());
        map.put("username", user.getUsername());
        map.put("tag", user.getTag());
        map.put("displayName", user.getDisplayName() != null ? user.getDisplayName() : user.getUsername());
        map.put("avatarUrl", user.getAvatarUrl() != null ? user.getAvatarUrl() : "");
        return map;
    }
}
