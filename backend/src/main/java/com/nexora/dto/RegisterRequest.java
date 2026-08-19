package com.nexora.dto;

import lombok.Data;

@Data
public class RegisterRequest {
    private String username;
    private String displayName;
    private String password;
}
