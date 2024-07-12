;; problem file: problem-bitdelivery-prob-0.pddl
(define (problem default)
    (:domain default)
    (:objects p0_1 p0_2 p0_3 p0_4 p0_5 p0_6 - position target - package me - agent)
    (:init (near p0_1 p0_2) (near p0_2 p0_1) (near p0_2 p0_3) (near p0_3 p0_2) (near p0_3 p0_4) (near p0_4 p0_3) (near p0_4 p0_5) (near p0_5 p0_4) (not (near p0_5 p0_6)) (near p0_6 p0_5) (on me p0_3) (on_pkg target p0_5))
    (:goal (holding me target))
)
