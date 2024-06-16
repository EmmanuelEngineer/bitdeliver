;; domain file: domain-bitdelivery-world_coop-1.pddl
(define (domain default)
    (:requirements :strips)
    (:predicates
        (holding ?ag - agent ?ob - package)
        (on ?x - agent ?pos - position)
        (on_pkg ?x - package ?pos - position)
        (near ?pos1 ?pos2 - position)
        (different ?ag1 ?ag2 - agent)              
    )
    (:action move_coop
    :parameters (?ag1 ?ag2 - agent ?from ?to - position)
    :precondition (and (on ?ag1 ?from) (near ?from ?to) (not (on ?ag2 ?to)) (different ?ag1 ?ag2))
    :effect (and (on ?ag1 ?to) (not (on ?ag1 ?from)))
)
        (:action grab
    :parameters (?ag1 - agent ?ob - package ?pos - position)
    :precondition (and (on ?ag1 ?pos) (on_pkg ?ob ?pos))
    :effect (and (holding ?ag1 ?ob) (not (on_pkg ?ob ?pos)))
)
        (:action drop
    :parameters (?ag1 - agent ?ob - package ?pos - position)
    :precondition (and (on ?ag1 ?pos) (holding ?ag1 ?ob))
    :effect (and (not (holding ?ag1 ?ob)) (on_pkg ?ob ?pos))
)
)