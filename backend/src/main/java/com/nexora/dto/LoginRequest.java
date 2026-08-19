package com.nexora.dto;

import lombok.Data;

@Data
public class LoginRequest {
    private String displayName;
    private String password;
}
