package com.nexora.repository;

import com.nexora.model.Server;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface ServerRepository extends JpaRepository<Server, Long> {
    Optional<Server> findByInviteCode(String inviteCode);

    @Query("SELECT s FROM Server s JOIN s.members m WHERE m.id = :userId")
    List<Server> findByMemberId(@Param("userId") Long userId);

    @Query("SELECT COUNT(s) > 0 FROM Server s JOIN s.members m WHERE s.id = :serverId AND m.id = :userId")
    boolean existsByIdAndMemberId(@Param("serverId") Long serverId, @Param("userId") Long userId);
}
