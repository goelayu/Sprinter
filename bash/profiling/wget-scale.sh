dir=/mnt/tmpfs/1/;
for i in $(seq 100 60 400); do
    mkdir -p $dir/$i;
    ./profiling/sys-usage-track.sh $dir/$i/sys/ &
    cat tranco2000.2  | while read page; do
        echo ./profiling/profile-cpu-wget.sh $page $dir/$i/ -p ;
    done | time -f "%E real\n%U user\n%S sys" parallel -j $i &> $dir/$i/cmd.log;
    ps aux | grep sys-usage-track | awk '{print $2}' | xargs kill -9 ;
done