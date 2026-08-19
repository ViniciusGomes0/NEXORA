package com.nexora.controller;

import com.nexora.model.User;
import com.nexora.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping("/me")
    public ResponseEntity<?> getMe(@AuthenticationPrincipal UserDetails ud) {
        User user = userService.findByDisplayName(ud.getUsername());
        return ResponseEntity.ok(profileMap(user));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getUser(@PathVariable Long id) {
        try {
            User user = userService.findById(id);
            return ResponseEntity.ok(profileMap(user));
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/me")
    public ResponseEntity<?> updateMe(@RequestBody Map<String, String> body,
                                      @AuthenticationPrincipal UserDetails ud) {
        try {
            User user = userService.findByDisplayName(ud.getUsername());
            User updated = userService.updateProfile(user.getId(), body.get("displayName"), body.get("avatarUrl"));
            return ResponseEntity.ok(profileMap(updated));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    private Map<String, Object> profileMap(User u) {
        return Map.of(
            "id", u.getId(),
            "username", u.getUsername(),
            "displayName", u.getDisplayName() != null ? u.getDisplayName() : u.getUsername(),
            "avatarUrl", u.getAvatarUrl() != null ? u.getAvatarUrl() : ""
        );
    }
}
