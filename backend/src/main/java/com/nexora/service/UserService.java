package com.nexora.service;

import com.nexora.dto.RegisterRequest;
import com.nexora.model.User;
import com.nexora.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Random;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final Random random = new Random();

    public User register(RegisterRequest req) {
        String displayName = req.getDisplayName() != null && !req.getDisplayName().isBlank()
                ? req.getDisplayName() : req.getUsername();

        if (userRepository.existsByDisplayName(displayName))
            throw new RuntimeException("Nome de exibição já em uso");

        String tag = generateTag(req.getUsername());

        User user = User.builder()
                .username(req.getUsername())
                .tag(tag)
                .password(passwordEncoder.encode(req.getPassword()))
                .displayName(displayName)
                .status("online")
                .build();
        return userRepository.save(user);
    }

    private String generateTag(String username) {
        List<String> usedTags = userRepository.findTagsByUsername(username);
        if (usedTags.size() >= 9999)
            throw new RuntimeException("Limite de contas com esse username atingido");

        String tag;
        do {
            tag = String.format("%04d", random.nextInt(9999) + 1);
        } while (usedTags.contains(tag));
        return tag;
    }

    public User findByDisplayName(String displayName) {
        return userRepository.findByDisplayName(displayName)
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
