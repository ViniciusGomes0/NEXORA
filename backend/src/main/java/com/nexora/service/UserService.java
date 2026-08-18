package com.nexora.service;

import com.nexora.dto.RegisterRequest;
import com.nexora.model.User;
import com.nexora.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public User register(RegisterRequest req) {
        if (userRepository.existsByEmail(req.getEmail()))
            throw new RuntimeException("Email já em uso");

        String tag = generateTag();

        User user = User.builder()
                .username(req.getUsername())
                .tag(tag)
                .email(req.getEmail())
                .password(passwordEncoder.encode(req.getPassword()))
                .displayName(req.getDisplayName() != null && !req.getDisplayName().isBlank()
                        ? req.getDisplayName() : req.getUsername())
                .status("online")
                .build();
        return userRepository.save(user);
    }

    private String generateTag() {
        long next = userRepository.count() + 1;
        return String.format("%04d", next);
    }

    public User findByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado"));
    }

    public User findById(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado"));
    }

    public User updateProfile(Long userId, String displayName, String avatarUrl) {
        User user = findById(userId);
        if (displayName != null && !displayName.isBlank()) user.setDisplayName(displayName);
        if (avatarUrl != null) user.setAvatarUrl(avatarUrl);
        return userRepository.save(user);
    }
}
