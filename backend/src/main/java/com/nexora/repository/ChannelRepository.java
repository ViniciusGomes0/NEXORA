package com.nexora.repository;

import com.nexora.model.Channel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface ChannelRepository extends JpaRepository<Channel, Long> {
    List<Channel> findByServerIdOrderByCreatedAtAsc(Long serverId);

    @Query("SELECT COUNT(c) > 0 FROM Channel c JOIN c.server.members m WHERE c.id = :channelId AND m.id = :userId")
    boolean isUserInChannelServer(@Param("channelId") Long channelId, @Param("userId") Long userId);
}
