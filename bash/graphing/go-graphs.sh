#! /usr/bin/env bash

# Create Go graphs using the go tool.

set -o errexit
set -o nounset
set -o pipefail
if [[ "${TRACE-0}" == "1" ]]; then
    set -o xtrace
fi

if [[ "${1-}" =~ ^-*h(elp)?$ ]]; then
    echo 'Usage: ./script.sh input output
Input -> Path to json file containing the network json file
Output -> path to the output directory where the graphs will be saved
'
    exit
fi

if [[ $# -ne 2 ]]; then
    echo 'Error: Invalid number of arguments'
    exit 1
fi

# get real paths of each argument
input=$(realpath "$1")
output=$(realpath "$2")
scriptdir=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )


# create the network dag using node script

cd $scriptdir/../../node
echo $(pwd)
node util/nw-dag.js -i $input -o $scriptdir/tmp

cd $scriptdir/../../go
export GOROOT=/w/goelayu/uluyol-sigcomm/go/

# create the graphs
go run dag.go -input1 $scriptdir/tmp -input2 $scriptdir/tmp -output $output/dag.html

# start python server to view the graphs

cd $output
sudo python3 -m http.server 8000



