package com.nexora.dto;

import com.nexora.model.Channel.ChannelType;
import lombok.Data;

@Data
public class ChannelRequest {
    private String name;
    private ChannelType type;
}
