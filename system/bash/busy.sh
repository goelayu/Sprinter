#! /usr/bin/env bash

# A simply script that keeps n number of cpus busy for a given amount of time

# $1 -> number of cpus to keep busy
# $2 -> time to keep busy

# Example: ./busy.sh 4 10

# trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT

busy(){
    LAST=1000000
    for i in $(seq 1 $LAST); do
        a=$((i+1));
    done
}

for i in $(seq 1 $1); do
    busy &
done

wait
